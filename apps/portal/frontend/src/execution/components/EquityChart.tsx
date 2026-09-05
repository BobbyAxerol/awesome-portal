/**
 * Equity vs approved research evidence — the centre chart of every workbench
 * (HiFi 1c/1e/1f/2a/2b; handoff §10.3). Rendered by `PrimusFinancialChart`
 * (uPlot, tracker OR-3) since the EDS-07 activation.
 *
 * Numbers: the server publishes decimal strings. Coordinates for plotting need
 * JS numbers, so `Number()` is used *only* to place a point on the canvas; every
 * value a person reads (pill, tooltip, table view) is the server's string —
 * verbatim in the table, exact-decimal formatted on the canvas. Nothing is
 * summed, averaged or derived — the approved band is drawn from the server's
 * lower/upper as published.
 *
 * Gaps are gaps: a missing bucket is a `null` point that breaks the line and a
 * hatched area where the server declared one, never an interpolated line.
 */
import { useCallback, useId, useMemo, useState } from "react";

import { PrimusFinancialChart, type FinancialMarker } from "../../charts/financial/PrimusFinancialChart";
import { RANGE_PRESETS, presetAvailable, presetRange, toFinancialData, type RangePreset } from "../../charts/financial/financialData";
import type { ChartEnvelope } from "../contracts";
import { formatExact } from "../formatExact";
import { envelopeCaption } from "./chart";

export { toFinancialData as equityChartData } from "../../charts/financial/financialData";

export interface EquityPoint {
  /** bucket start, ISO-8601 UTC */
  t: string;
  /** decimal string as published; null = bucket missing (gap) */
  equity: string | null;
  drawdown?: string | null;
}
export interface EquityBandPoint {
  t: string;
  lower: string;
  upper: string;
}
export interface EquityGap {
  from: string;
  to: string;
  reason: string;
}
export interface EquitySeries {
  label: string;
  points: readonly EquityPoint[];
  /** approved research band, joined by run id + artifact digest (server-side) */
  band?: readonly EquityBandPoint[] | null;
  bandLabel?: string | null;
  gaps?: readonly EquityGap[] | null;
  /** true only on the fixtures evidence page: not a published projection */
  evidenceOnly?: boolean;
  /**
   * What the values are. `drawdown` draws downward from zero in the bad tone;
   * anything else is a level series in the primary tone. Absent = `equity`.
   */
  kind?: "equity" | "drawdown" | "value";
}

export interface EquityChartProps {
  title: string;
  envelope: ChartEnvelope;
  /** null = the contract does not publish a series → compact honest state */
  series: EquitySeries | null;
  unavailableReason?: string;
  height?: number;
  id?: string;
  /** Cross-filter source: a bucket picked on the canvas or in the table view. */
  onSelectBucket?: (t: string) => void;
  /**
   * Tile mode (Insight grids): two tools instead of the full row, no legend,
   * caption folded to one line. Expand restores the full chart.
   */
  compact?: boolean;
  /** The server's freshness verdict for this series. True pulses the last point; never inferred here. */
  live?: boolean;
  /** Time markers drawn on the canvas (risk decisions, halts) — labels are the server's. */
  markers?: readonly FinancialMarker[];
}

const EXPANDED_HEIGHT = 560;
const DEFAULT_HEIGHT = 300;

export function EquityChart({
  title,
  envelope,
  series,
  unavailableReason = "Equity series not published — equity_projection.v1 requested (BR-EX-34).",
  height = DEFAULT_HEIGHT,
  id,
  onSelectBucket,
  compact = false,
  live = false,
  markers,
}: EquityChartProps) {
  const [exported, setExported] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [table, setTable] = useState(false);
  const [zoomEpoch, setZoomEpoch] = useState(0);
  const [scale, setScale] = useState<"linear" | "log">("linear");
  const [preset, setPreset] = useState<RangePreset | "custom">("ALL");
  const [showBand, setShowBand] = useState(true);
  const uid = useId();
  const tile = compact && !expanded;
  const data = useMemo(() => (series ? toFinancialData(series) : null), [series]);
  // `undefined` leaves a drag-zoom alone; `null` is an explicit "whole series".
  const range = useMemo(() => (data && preset !== "custom" ? presetRange(data.xs, preset) : undefined), [data, preset]);
  const unit = series?.kind === "drawdown" ? "ratio" : "money";
  const formatValue = useCallback((raw: string) => formatExact(raw, unit).display, [unit]);
  const resetZoom = () => {
    setZoomEpoch((n) => n + 1);
    setPreset("ALL");
  };

  if (!series || !data) {
    return (
      <section className="exec-chart-tile exec-chart-unavailable" aria-label={title}>
        <div className="exec-chart-head">
          <h3 className="exec-section-title">{title}</h3>
        </div>
        <p className="exec-chart-unavailable-body" role="status">
          {unavailableReason}
        </p>
        <EnvelopeCaption envelope={envelope} compact={compact} />
        <EnvelopeWarnings envelope={envelope} />
      </section>
    );
  }
  const gapCount = data.missing;
  const presets = RANGE_PRESETS.filter((p) => presetAvailable(data.xs, p));
  const plotHeight = expanded ? EXPANDED_HEIGHT : height;
  const footer = `${envelope.authority} · as of ${envelope.asOf}${envelope.formulaVersion ? ` · ${envelope.formulaVersion}` : ""}`;
  return (
    <section className={`exec-chart-tile exec-equity${expanded ? " exec-chart-expanded" : ""}`} aria-label={title}>
      <div className="exec-chart-head">
        <h3 className="exec-section-title">{title}</h3>
        <div className="exec-chart-tools" role="group" aria-label="Chart view">
          {tile ? null : (
            <>
              <span className="exec-chart-seg" role="group" aria-label="Axis scale">
                <button type="button" className="exec-btn-ghost" aria-pressed={scale === "linear"} onClick={() => setScale("linear")}>
                  Lin
                </button>
                <button
                  type="button"
                  className="exec-btn-ghost"
                  aria-pressed={scale === "log"}
                  disabled={!data.positive}
                  title={data.positive ? undefined : "A log axis needs every value above zero"}
                  onClick={() => setScale("log")}
                >
                  Log
                </button>
              </span>
              {presets.length > 1 ? (
                <span className="exec-chart-seg" role="group" aria-label="Window">
                  {presets.map((p) => (
                    <button key={p} type="button" className="exec-btn-ghost" aria-pressed={preset === p} onClick={() => setPreset(p)}>
                      {p}
                    </button>
                  ))}
                </span>
              ) : null}
            </>
          )}
          {/* Zoom resets on double-click (announced in the plot's label); a
              standing "Reset zoom" button was an enabled no-op until the
              reader had zoomed, which the EL-V2-03 sweep rightly rejects. */}
          <button type="button" className="exec-btn-ghost" aria-pressed={table} onClick={() => setTable((v) => !v)}>
            {table ? "Chart" : "Table"}
          </button>
          <button type="button" className="exec-btn-ghost" aria-pressed={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Collapse" : "Expand"}
          </button>
          {tile ? null : (
            <button
              type="button"
              className="exec-btn-ghost"
              onClick={() => {
                // Export = the published points as JSON strings, bounded to this window; never a derived figure.
                const text = JSON.stringify({ label: series.label, envelope, points: series.points, band: series.band ?? null }, null, 2);
                void navigator.clipboard?.writeText(text);
                setExported(`${series.points.length} buckets copied as JSON`);
              }}
            >
              Export
            </button>
          )}
        </div>
      </div>
      {exported ? <p className="exec-role-meta" role="status">{exported}</p> : null}
      {series.evidenceOnly ? (
        <p className="exec-chart-evidence-note" role="note">
          Evidence fixture — not a published projection.
        </p>
      ) : null}
      {data.dropped > 0 ? (
        <p className="exec-chart-evidence-note" role="note">
          {data.dropped} {data.dropped === 1 ? "point" : "points"} not plotted — unreadable timestamp.
        </p>
      ) : null}
      {tile || table ? null : (
        <div className="exec-chart-legend" aria-label="Legend">
          <span>
            <span className="exec-chart-swatch" data-tone={series.kind === "drawdown" ? "bad" : "line"} aria-hidden="true" /> {series.label}
          </span>
          {data.hasBand ? (
            <button type="button" aria-pressed={showBand} onClick={() => setShowBand((v) => !v)} title="Show or hide the approved band">
              <span className="exec-chart-swatch" data-tone="band" aria-hidden="true" /> {series.bandLabel ?? "approved band"}
            </button>
          ) : null}
          {data.gaps.length > 0 ? (
            <span>
              <span className="exec-chart-swatch" data-tone="gap" aria-hidden="true" /> {data.gaps.length} declared {data.gaps.length === 1 ? "gap" : "gaps"}
            </span>
          ) : null}
        </div>
      )}
      {table ? (
        <div className="exec-scroll-x exec-chart-table" style={{ maxHeight: plotHeight }}>
          <table className="exec-360-sync">
            <caption className="exec-blotter-note">
              {series.label} · {series.points.length} buckets · {gapCount} missing
            </caption>
            <thead>
              <tr>
                <th scope="col">bucket (UTC)</th>
                <th scope="col">{series.label}</th>
                {series.band ? <th scope="col">{series.bandLabel ?? "approved band"}</th> : null}
              </tr>
            </thead>
            <tbody>
              {series.points.map((p) => {
                const b = series.band?.find((x) => x.t === p.t);
                return (
                  <tr
                    key={p.t}
                    data-gap={p.equity === null ? "true" : undefined}
                    onClick={onSelectBucket ? () => onSelectBucket(p.t) : undefined}
                    role={onSelectBucket ? "button" : undefined}
                    tabIndex={onSelectBucket ? 0 : undefined}
                    onKeyDown={onSelectBucket ? (e) => { if (e.key === "Enter" || e.key === " ") onSelectBucket(p.t); } : undefined}
                  >
                    <th scope="row"><span className="exec-num">{p.t}</span></th>
                    <td><span className="exec-num">{p.equity ?? "gap"}</span></td>
                    {series.band ? <td><span className="exec-num">{b ? `${b.lower} … ${b.upper}` : "—"}</span></td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : data.xs.length === 0 ? (
        <p className="exec-chart-empty" role="status">
          No plottable buckets — {data.dropped} {data.dropped === 1 ? "point" : "points"} had unreadable timestamps.
        </p>
      ) : (
        <div
          className="exec-chart-body"
          role="img"
          aria-label={`${title}: ${series.label}, ${series.points.length} buckets, ${gapCount} missing. Drag to zoom, Ctrl+wheel to zoom, double-click resets zoom.`}
          onDoubleClick={resetZoom}
          data-zoom-epoch={zoomEpoch}
        >
          <PrimusFinancialChart
            key={zoomEpoch}
            id={id ?? `${uid}-equity`}
            data={data}
            height={plotHeight}
            scale={scale}
            range={range}
            compact={tile}
            tone={series.kind === "drawdown" ? "bad" : "line"}
            showBand={showBand}
            live={live}
            markers={markers}
            formatValue={formatValue}
            footer={footer}
            onZoom={(r) => setPreset(r === null ? "ALL" : "custom")}
            onSelectBucket={onSelectBucket}
          />
        </div>
      )}
      <EnvelopeCaption envelope={envelope} compact={tile} />
      <EnvelopeWarnings envelope={envelope} />
    </section>
  );
}

/**
 * The mandatory §16.2 caption. In tile mode the four fields a reader scans
 * (window · interval · currency · authority) stay on one line and the rest
 * folds behind "envelope" — still in the DOM, still copyable, never truncated
 * with an ellipsis (audit F7).
 */
export function EnvelopeCaption({ envelope, compact = false }: { envelope: ChartEnvelope; compact?: boolean }) {
  const full = envelopeCaption(envelope);
  if (!compact) return <p className="exec-role-meta exec-chart-envelope">{full}</p>;
  const short = [envelope.window, envelope.interval, envelope.currency, envelope.authority].filter(Boolean).join(" · ");
  return (
    <div className="exec-role-meta exec-chart-envelope exec-chart-envelope-compact">
      <details className="exec-envelope-more">
        <summary>
          <span className="exec-envelope-short">{short}</span>
          <span className="exec-envelope-toggle">envelope</span>
        </summary>
        <span className="exec-envelope-full">{full}</span>
      </details>
    </div>
  );
}

/**
 * Server warnings travel with the envelope (§16.2). `ChartTile` printed them;
 * this chart dropped them, so a series the server flagged read as clean.
 */
function EnvelopeWarnings({ envelope }: { envelope: ChartEnvelope }) {
  if (!envelope.warnings?.length) return null;
  return (
    <div className="exec-tile-warning exec-chart-warning" role="note">
      {envelope.warnings.map((warning) => (
        <div key={warning}>! {warning}</div>
      ))}
    </div>
  );
}
