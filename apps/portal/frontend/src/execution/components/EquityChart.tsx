/**
 * Equity vs approved research evidence — the centre chart of every workbench
 * (HiFi 1c/1e/1f/2a/2b; handoff §10.3).
 *
 * Numbers: the server publishes decimal strings. Coordinates for plotting need
 * JS numbers, so `Number()` is used *only* to place a point on the canvas; every
 * value a person reads (tooltip, table view) is the server's string verbatim.
 * Nothing is summed, averaged or derived — the approved band is drawn from the
 * server's lower/upper as published.
 *
 * Gaps are gaps: a missing bucket is a `null` point (`connectNulls:false`) and a
 * shaded mark area, never an interpolated line.
 */
import { useId, useMemo, useState } from "react";
import type { EChartsOption, LineSeriesOption } from "echarts";
import { EChart } from "../../charts/EChart";
import { baseOption } from "../../charts/theme";
import type { ChartEnvelope } from "../contracts";
import { envelopeCaption } from "./chart";
import { activeTheme } from "../../styles/tokens";
import { chartTokens } from "../../charts/theme";

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
}

export interface EquityChartProps {
  title: string;
  envelope: ChartEnvelope;
  /** null = the contract does not publish a series → compact honest state */
  series: EquitySeries | null;
  unavailableReason?: string;
  height?: number;
  id?: string;
  /** Cross-filter source: a bucket picked in the table view (chart clicks need no wrapper change). */
  onSelectBucket?: (t: string) => void;
  /**
   * Tile mode (Insight grids): two tools instead of four, no slider, no
   * legend, caption folded to one line. Expand restores the full chart.
   */
  compact?: boolean;
}

const EXPANDED_HEIGHT = 560;
const DEFAULT_HEIGHT = 300;

function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Build the ECharts option. Exported for tests: option shape is the contract. */
export interface EquityOptionOpts {
  /** Tile mode: no slider, no legend, tighter grid — the title already names the series. */
  compact?: boolean;
}

export function equityOption(series: EquitySeries, envelope: ChartEnvelope, zoomEpoch: number, opts: EquityOptionOpts = {}): EChartsOption {
  const tokens = chartTokens(activeTheme());
  // Band colour comes from the execution token; the theme accent is the
  // fallback so no raw colour literal lives outside the token files (U02).
  const warn =
    (typeof getComputedStyle === "function"
      ? getComputedStyle(document.documentElement).getPropertyValue("--exec-warn").trim()
      : "") || tokens.accent;
  const colors = { good: tokens.good, bad: tokens.bad, warn };
  const times = series.points.map((p) => p.t);
  const equity = series.points.map((p) => num(p.equity));
  const byTime = new Map(series.band?.map((b) => [b.t, b]) ?? []);
  const lower = times.map((t) => num(byTime.get(t)?.lower));
  // Stacked area needs the height of the band, not its top: a rendering
  // quantity only — it is never shown as a number.
  const bandHeight = times.map((t) => {
    const b = byTime.get(t);
    const lo = num(b?.lower);
    const hi = num(b?.upper);
    return lo === null || hi === null ? null : hi - lo;
  });
  const gapAreas = (series.gaps ?? []).map((g) => [
    { xAxis: g.from, name: g.reason },
    { xAxis: g.to },
  ]);
  const raw = new Map(series.points.map((p) => [p.t, p]));
  const gaps = series.gaps ?? [];
  const gapAt = (t: string) => gaps.find((g) => t >= g.from && t < g.to);
  const compact = opts.compact === true;
  return baseOption({
    animation: false,
    grid: compact
      ? { left: 52, right: 12, top: 12, bottom: 28, containLabel: false }
      : { left: 64, right: 16, top: 28, bottom: 56, containLabel: false },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line" },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const first = list[0] as { axisValue?: string } | undefined;
        const t = String(first?.axisValue ?? "");
        const p = raw.get(t);
        const b = byTime.get(t);
        const rows = [
          `<div class="exec-chart-tip-t">${t}</div>`,
          `<div><span class="exec-chart-tip-k">${series.label}</span> <span class="exec-chart-tip-v">${
            p?.equity ?? "gap — not published"
          }</span></div>`,
        ];
        if (p?.drawdown) rows.push(`<div><span class="exec-chart-tip-k">drawdown</span> <span class="exec-chart-tip-v">${p.drawdown}</span></div>`);
        if (b) rows.push(`<div><span class="exec-chart-tip-k">${series.bandLabel ?? "approved band"}</span> <span class="exec-chart-tip-v">${b.lower} … ${b.upper}</span></div>`);
        // The gap reason lives here, not painted over the plot: a markArea
        // label at the top of a 220px tile sat on the legend (audit F8).
        const g = gapAt(t);
        if (g) rows.push(`<div><span class="exec-chart-tip-k">gap</span> <span class="exec-chart-tip-v">${g.reason}</span></div>`);
        rows.push(
          `<div class="exec-chart-tip-env">${envelope.authority} · as of ${envelope.asOf}${
            envelope.formulaVersion ? ` · ${envelope.formulaVersion}` : ""
          }</div>`,
        );
        return rows.join("");
      },
    },
    xAxis: {
      type: "category",
      data: times,
      boundaryGap: false,
      axisLabel: { formatter: (v: string) => v.slice(5, 10), hideOverlap: true },
    },
    // Currency lives in the envelope caption; a y-axis name here collided
    // with the legend. The stacked helper series stays out of the legend.
    legend: compact ? { show: false } : { data: [series.bandLabel ?? "approved band", series.label], top: 0, right: 0 },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: (v: number) => String(v) },
    },
    dataZoom: compact
      ? [{ type: "inside", start: 0, end: 100, zoomLock: false, id: `inside-${zoomEpoch}` }]
      : [
          { type: "inside", start: 0, end: 100, zoomLock: false, id: `inside-${zoomEpoch}` },
          { type: "slider", start: 0, end: 100, height: 18, bottom: 8, id: `slider-${zoomEpoch}` },
        ],
    series: ([
      {
        name: "band-lower",
        type: "line",
        data: lower,
        stack: "band",
        lineStyle: { opacity: 0 },
        symbol: "none",
        silent: true,
        connectNulls: false,
      },
      {
        name: series.bandLabel ?? "approved band",
        type: "line",
        data: bandHeight,
        stack: "band",
        lineStyle: { opacity: 0 },
        areaStyle: { color: colors.warn, opacity: 0.16 },
        symbol: "none",
        silent: true,
        connectNulls: false,
      },
      {
        name: series.label,
        type: "line",
        data: equity,
        symbol: "none",
        connectNulls: false,
        lineStyle: { width: 1.5, color: colors.good },
        markArea: gapAreas.length
          ? ({ silent: true, label: { show: false }, itemStyle: { color: colors.bad, opacity: 0.14 }, data: gapAreas } as LineSeriesOption["markArea"])
          : undefined,
      },
    ] as LineSeriesOption[]),
  });
}

export function EquityChart({
  title,
  envelope,
  series,
  unavailableReason = "Equity series not published — equity_projection.v1 requested (BR-EX-34).",
  height = DEFAULT_HEIGHT,
  id,
  onSelectBucket,
  compact = false,
}: EquityChartProps) {
  const [exported, setExported] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [table, setTable] = useState(false);
  const [zoomEpoch, setZoomEpoch] = useState(0);
  const uid = useId();
  const tile = compact && !expanded;
  const option = useMemo(
    () => (series ? equityOption(series, envelope, zoomEpoch, { compact: tile }) : null),
    [series, envelope, zoomEpoch, tile],
  );
  if (!series || !option) {
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
  const gapCount = series.points.filter((p) => p.equity === null).length;
  return (
    <section
      className={`exec-chart-tile exec-equity${expanded ? " exec-chart-expanded" : ""}`}
      aria-label={title}
    >
      <div className="exec-chart-head">
        <h3 className="exec-section-title">{title}</h3>
        <div className="exec-chart-tools" role="group" aria-label="Chart view">
          {tile ? null : (
            <button type="button" className="exec-btn-ghost" onClick={() => setZoomEpoch((n) => n + 1)}>
              Reset zoom
            </button>
          )}
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
      {table ? (
        <div className="exec-scroll-x exec-chart-table" style={{ maxHeight: expanded ? EXPANDED_HEIGHT : height }}>
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
      ) : (
        <div
          className="exec-chart-body"
          role="img"
          aria-label={`${title}: ${series.label}, ${series.points.length} buckets, ${gapCount} missing. Double-click resets zoom.`}
          onDoubleClick={() => setZoomEpoch((n) => n + 1)}
          data-zoom-epoch={zoomEpoch}
        >
          <EChart id={id ?? `${uid}-equity`} option={option} height={expanded ? EXPANDED_HEIGHT : height} />
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
