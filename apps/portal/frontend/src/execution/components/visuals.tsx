/**
 * Stage visuals — the charts and gauges hi-fi 1c–1f draw and the fixture
 * profile could not: multi-stage equity, envelope consumption, ACK latency
 * distribution, sparklines, daily contribution, a positions table and the
 * order-type matrix. Every one of them prints its smoke warning when the data
 * is smoke; none of them computes a financial figure — values arrive formatted.
 */
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "../../charts/EChart";
import { baseOption, chartTokens } from "../../charts/theme";
import { activeTheme } from "../../styles/tokens";
import type { CapGaugeItem, DailyBar, Histogram, OrderTypeRow, PositionRow, Spark, StageLine } from "../stage.smoke";
import { EnvelopeCaption } from "./EquityChart";
import type { ChartEnvelope } from "../contracts";

export function SmokeNote({ warning }: { warning?: string | null }) {
  if (!warning) return null;
  return (
    <p className="exec-tile-warning exec-chart-warning exec-smoke-note" role="note">
      ! {warning}
    </p>
  );
}

/* ---------------------------------------------------------------- lines */

const DASH: Record<StageLine["style"], "solid" | "dashed" | "dotted"> = { solid: "solid", dashed: "dashed", dotted: "dotted" };

export function stageLinesOption(lines: StageLine[]): EChartsOption {
  const t = chartTokens(activeTheme());
  const times = lines[0]?.points.map((p) => p.t) ?? [];
  return baseOption({
    grid: { left: 52, right: 12, top: 28, bottom: 28, containLabel: false },
    legend: { data: lines.map((l) => l.label), top: 0, right: 0 },
    xAxis: { type: "category", data: times, boundaryGap: false, axisLabel: { formatter: (v: string) => v.slice(5, 10), hideOverlap: true } },
    yAxis: { type: "value", scale: true },
    series: lines.map((l, i) => ({
      name: l.label,
      type: "line",
      data: l.points.map((p) => p.v),
      symbol: "none",
      connectNulls: false,
      lineStyle: { width: i === 0 ? 1.8 : 1.2, type: DASH[l.style], color: i === 0 ? t.good : i === 1 ? t.accent : t.inkFaint },
    })),
  });
}

export function StageLinesChart({ title, lines, envelope, height = 260, warning }: { title: string; lines: StageLine[]; envelope: ChartEnvelope; height?: number; warning?: string | null }) {
  const option = useMemo(() => stageLinesOption(lines), [lines]);
  return (
    <section className="exec-chart-tile exec-equity exec-visual" aria-label={title}>
      <div className="exec-chart-head">
        <h3 className="exec-section-title">{title}</h3>
        <span className="exec-role-meta exec-visual-legend">solid = this stage · dashed = paper · dotted = backtest</span>
      </div>
      <div className="exec-chart-body" role="img" aria-label={`${title}: ${lines.map((l) => l.label).join(", ")}`}>
        <EChart option={option} height={height} />
      </div>
      <EnvelopeCaption envelope={envelope} compact />
      <SmokeNote warning={warning} />
    </section>
  );
}

/* --------------------------------------------------------------- gauges */

export function CapGauges({ title, items, warning }: { title: string; items: CapGaugeItem[]; warning?: string | null }) {
  return (
    <section className="exec-gate-panel exec-visual exec-caps" aria-label={title}>
      <h3 className="exec-section-title">{title}</h3>
      <ul className="exec-caps-list">
        {items.map((c) => {
          const frac = c.cap > 0 ? c.used / c.cap : 0;
          const warnAt = c.warnAt ?? 0.8;
          // warnAt > 1 marks a target ("30/30 days"): reaching it is good, not a breach.
          const tone = warnAt > 1 ? "good" : frac >= 1 ? "bad" : frac >= warnAt ? "warn" : "good";
          const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
          return (
            <li key={c.label} className="exec-cap" data-tone={tone}>
              <div className="exec-cap-head">
                <span className="exec-role-body">{c.label}</span>
                <span className="exec-role-num exec-cap-figure">
                  {fmt(c.used)} / {fmt(c.cap)}{c.unit ? ` ${c.unit}` : ""}
                </span>
              </div>
              <div className="exec-cap-track" role="meter" aria-valuemin={0} aria-valuemax={c.cap} aria-valuenow={c.used} aria-label={c.label}>
                <div className="exec-cap-fill" style={{ width: `${Math.min(100, Math.max(0, frac * 100))}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <SmokeNote warning={warning} />
    </section>
  );
}

/* ------------------------------------------------------------ histogram */

export function HistogramChart({ hist, height = 180, warning }: { hist: Histogram; height?: number; warning?: string | null }) {
  const option = useMemo(() => {
    const t = chartTokens(activeTheme());
    return baseOption({
      grid: { left: 40, right: 12, top: 12, bottom: 28, containLabel: false },
      legend: { show: false },
      dataZoom: [],
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: hist.buckets.map((b) => `${b.from}`), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value" },
      series: [
        { name: hist.label, type: "bar", data: hist.buckets.map((b) => b.count), itemStyle: { color: t.accent, borderRadius: [3, 3, 0, 0] }, barCategoryGap: "25%" },
      ],
    });
  }, [hist]);
  return (
    <section className="exec-chart-tile exec-visual" aria-label={hist.label}>
      <div className="exec-chart-head">
        <h3 className="exec-section-title">{hist.label}</h3>
        <span className="exec-role-num exec-visual-stat">p50 {hist.p50}{hist.unit} · p95 {hist.p95}{hist.unit}</span>
      </div>
      <div className="exec-chart-body" role="img" aria-label={`${hist.label} distribution, p50 ${hist.p50}${hist.unit}, p95 ${hist.p95}${hist.unit}`}>
        <EChart option={option} height={height} />
      </div>
      <SmokeNote warning={warning} />
    </section>
  );
}

/* ------------------------------------------------------------ sparkline */

export function SparkTile({ spark, height = 72, warning }: { spark: Spark; height?: number; warning?: string | null }) {
  const last = spark.points[spark.points.length - 1]?.v ?? null;
  const option = useMemo(() => {
    const t = chartTokens(activeTheme());
    const over = spark.ceiling !== null && spark.ceiling !== undefined && last !== null && last > spark.ceiling;
    return baseOption({
      grid: { left: 4, right: 4, top: 6, bottom: 4, containLabel: false },
      legend: { show: false },
      dataZoom: [],
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: spark.points.map((p) => p.t.slice(5, 10)), show: false },
      yAxis: { type: "value", show: false, scale: true },
      series: [
        {
          name: spark.label,
          type: "line",
          data: spark.points.map((p) => p.v),
          symbol: "none",
          lineStyle: { width: 1.4, color: over ? t.bad : t.good },
          areaStyle: { opacity: 0.12, color: over ? t.bad : t.good },
          markLine: spark.ceiling !== null && spark.ceiling !== undefined ? { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: t.bad, type: "dashed" }, data: [{ yAxis: spark.ceiling }] } : undefined,
        },
      ],
    });
  }, [spark, last]);
  return (
    <section className="exec-visual exec-spark" aria-label={spark.label}>
      <div className="exec-spark-head">
        <span className="exec-role-meta">{spark.label}</span>
        <span className="exec-role-num">
          {last ?? "—"}{spark.unit ? ` ${spark.unit}` : ""}
          {spark.ceiling !== null && spark.ceiling !== undefined ? <span className="exec-role-meta"> / {spark.ceiling}{spark.unit ? ` ${spark.unit}` : ""}</span> : null}
        </span>
      </div>
      <EChart option={option} height={height} />
      <SmokeNote warning={warning} />
    </section>
  );
}

/* ------------------------------------------------------- daily bars */

export function DailyBarsChart({ title, bars, unit, height = 200, warning }: { title: string; bars: DailyBar[]; unit: string; height?: number; warning?: string | null }) {
  const option = useMemo(() => {
    const t = chartTokens(activeTheme());
    return baseOption({
      grid: { left: 52, right: 12, top: 12, bottom: 28, containLabel: false },
      legend: { show: false },
      dataZoom: [],
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: bars.map((b) => b.t.slice(5)), axisLabel: { hideOverlap: true } },
      yAxis: { type: "value" },
      series: [{ name: title, type: "bar", data: bars.map((b) => ({ value: b.v, itemStyle: { color: b.v >= 0 ? t.good : t.bad } })), barCategoryGap: "30%" }],
    });
  }, [bars, title]);
  const total = bars.reduce((s, b) => s + b.v, 0);
  return (
    <section className="exec-chart-tile exec-visual" aria-label={title}>
      <div className="exec-chart-head">
        <h3 className="exec-section-title">{title}</h3>
        <span className="exec-role-num exec-visual-stat">30d {total >= 0 ? "+" : ""}{total.toFixed(2)} {unit}</span>
      </div>
      <div className="exec-chart-body" role="img" aria-label={`${title}, 30 daily bars`}>
        <EChart option={option} height={height} />
      </div>
      <SmokeNote warning={warning} />
    </section>
  );
}

/* --------------------------------------------------------- positions */

export function PositionsTable({ rows, warning, caption }: { rows: PositionRow[]; warning?: string | null; caption?: string }) {
  const showLev = rows.some((r) => r.leverage);
  const showAck = rows.some((r) => r.ackLatencyMs !== undefined);
  return (
    <section className="exec-visual exec-positions" aria-label="Positions">
      <div className="exec-scroll-x">
        <table className="exec-360-sync exec-positions-table">
          {caption ? <caption className="exec-role-meta">{caption}</caption> : null}
          <thead>
            <tr>
              <th scope="col">symbol</th>
              <th scope="col">side</th>
              <th scope="col">qty</th>
              <th scope="col">entry</th>
              <th scope="col">uPnL</th>
              {showLev ? <th scope="col">leverage</th> : null}
              {showAck ? <th scope="col">ack latency</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <th scope="row" className="exec-role-id">{r.symbol}</th>
                <td><span className="exec-chip" data-tone={r.side === "LONG" ? "good" : "warn"}>{r.side}</span></td>
                <td className="exec-num">{r.qty}</td>
                <td className="exec-num">{r.entry}</td>
                <td className="exec-num" data-sign={r.uPnl.startsWith("−") || r.uPnl.startsWith("-") ? "neg" : "pos"}>{r.uPnl}</td>
                {showLev ? <td className="exec-num">{r.leverage ?? "—"}</td> : null}
                {showAck ? <td className="exec-num">{r.ackLatencyMs !== undefined ? `p50 ${r.ackLatencyMs}ms` : "—"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SmokeNote warning={warning} />
    </section>
  );
}

/* ------------------------------------------------------ order types */

export function OrderTypeMatrix({ rows, warning }: { rows: OrderTypeRow[]; warning?: string | null }) {
  const glyph = { certified: "✓", pending: "!", untested: "✕" } as const;
  return (
    <section className="exec-gate-panel exec-visual" aria-label="Order-type certification">
      <h3 className="exec-section-title">Order-type certification</h3>
      <ul className="exec-ordertypes">
        {rows.map((r) => (
          <li key={r.type} data-state={r.state}>
            <span className="exec-ordertype-glyph">{glyph[r.state]}</span>
            <span className="exec-role-id">{r.type}</span>
            <span className="exec-role-meta">{r.note}</span>
          </li>
        ))}
      </ul>
      <SmokeNote warning={warning} />
    </section>
  );
}
