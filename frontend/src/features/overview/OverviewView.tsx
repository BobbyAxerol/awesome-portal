/** Overview: KPI hero, equity compare, underwater, metrics, verdict chain (§14).
 *  Protocol-aware: three-window uses 3 fresh-account segments + calendar
 *  presentation; advanced_walk_forward uses the single stitched OOS account
 *  (v0.1.1 bugfix — the 3-segment queries 404 for advanced runs). */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption, roleColors } from "../../charts/theme";
import { ChartFigure } from "../../components/ChartFigure";
import { MetricHero, SegmentedControl, StateView } from "../../components/ui";
import { api, type SeriesPayload } from "../../lib/api";
import { fmtCount, fmtMoney, fmtPct, fmtRatio } from "../../lib/format";

const SEGMENTS = ["is", "oos", "holdout_live"] as const;
type SegmentKey = (typeof SEGMENTS)[number];
const SEGMENT_LABELS: Record<string, string> = {
  is: "IS",
  oos: "OOS",
  holdout_live: "Holdout Live",
  stitched: "Stitched OOS",
};

export function OverviewView({ runId }: { runId: string }) {
  const detail = useQuery({ queryKey: ["run", runId], queryFn: () => api.getRun(runId) });
  const protocol = detail.data?.protocol ?? "three_window_decay";
  const advanced = protocol === "advanced_walk_forward";
  const summary = useQuery({ queryKey: ["summary", runId], queryFn: () => api.summary(runId) });
  const [selected, setSelected] = useState<SegmentKey | "stitched" | "compare">("compare");
  const [capitalMode, setCapitalMode] = useState<"capital" | "rebased">("capital");

  // three-window: 3 segment series + calendar/rebased presentation artifacts.
  // advanced: single stitched series (no presentation artifacts exist).
  const segmentQueries = SEGMENTS.map((segment) =>
    useQuery({
      queryKey: ["series", runId, segment],
      queryFn: () => api.series(runId, segment, 3000),
      enabled: !advanced,
      staleTime: 60_000,
    }),
  );
  const stitchedQuery = useQuery({
    queryKey: ["series", runId, "stitched"],
    queryFn: () => api.series(runId, "stitched", 3000),
    enabled: advanced,
    staleTime: 60_000,
  });
  const presentation = useQuery({
    queryKey: ["presentation", runId, capitalMode],
    queryFn: () => api.presentation(runId, capitalMode === "capital" ? "calendar" : "rebased", 5000),
    enabled: !advanced,
  });

  const segments = useMemo(() => {
    const out: Array<{ key: SegmentKey | "stitched"; series: SeriesPayload | undefined }> = [];
    if (advanced) {
      out.push({ key: "stitched", series: stitchedQuery.data });
    } else {
      for (let i = 0; i < SEGMENTS.length; i += 1) {
        out.push({ key: SEGMENTS[i], series: segmentQueries[i].data });
      }
    }
    return out;
  }, [advanced, segmentQueries, stitchedQuery.data]);

  const metrics = summary.data?.metrics.segments ?? {};
  const loaded =
    (advanced ? Boolean(stitchedQuery.data) : segments.every((segment) => segment.series)) &&
    Boolean(summary.data) &&
    (advanced || Boolean(presentation.data));

  const heroKey: string = advanced ? "stitched" : selected === "compare" ? "holdout_live" : selected;
  const heroMetrics = (metrics as Record<string, Record<string, number | null>>)[heroKey] ?? {};

  const equityOption = useMemo(() => {
    if (advanced) {
      const payload = stitchedQuery.data;
      const equity = payload?.series.equity ?? [];
      const base = equity.find((value) => value != null) ?? 1;
      const values = capitalMode === "capital" ? equity : equity.map((value) => (value == null ? null : (value / base) * 100));
      const data = values.map((value, index) => [payload?.timestamps[index], value]);
      return baseOption({
        grid: { left: 58, right: 24, top: 46, bottom: 54, containLabel: true },
        legend: { show: false },
        xAxis: {
          type: "time",
          splitNumber: 5,
          axisLabel: { hideOverlap: true, formatter: "{yyyy}", margin: 10 },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "var(--ink-faint)", fontSize: 11 },
          splitLine: { lineStyle: { color: "var(--line-soft)", type: "dashed" } },
        },
        series: [
          {
            name: "Stitched OOS",
            type: "line" as const,
            showSymbol: false,
            connectNulls: false,
            data,
            lineStyle: { width: 1.75, color: roleColors.oos },
            itemStyle: { color: roleColors.oos },
          },
        ],
      });
    }
    const payload = presentation.data;
    const series = SEGMENTS.filter((key) => selected === "compare" || key === selected).map((key) => {
      const values = payload?.series[`${key}_equity`] ?? [];
      const data = values.map((value, index) => [payload?.timestamps[index], value]);
      return {
        name: SEGMENT_LABELS[key],
        type: "line" as const,
        showSymbol: false,
        connectNulls: false,
        data,
        lineStyle: { width: 1.75, color: roleColors[key] },
        itemStyle: { color: roleColors[key] },
      };
    });
    return baseOption({
      grid: { left: 58, right: 24, top: 46, bottom: 54, containLabel: true },
      legend: { data: series.map((item) => item.name), top: 2, right: 12, left: "auto" },
      xAxis: {
        type: "time",
        splitNumber: 5,
        axisLabel: { hideOverlap: true, formatter: "{yyyy}", margin: 10 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "var(--ink-faint)", fontSize: 11 },
        splitLine: { lineStyle: { color: "var(--line-soft)", type: "dashed" } },
      },
      series,
    });
  }, [advanced, capitalMode, presentation.data, selected, stitchedQuery.data]);

  const underwaterOption = useMemo(() => {
    const active = segments.filter((segment) => segment.series);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 48, containLabel: true },
      legend: { show: false },
      xAxis: {
        type: "time",
        splitNumber: 5,
        axisLabel: { hideOverlap: true, formatter: "{yyyy}", margin: 10 },
      },
      series: active.map((segment) => {
        const payload = segment.series!;
        const dd = payload.series.drawdown ?? [];
        return {
          name: SEGMENT_LABELS[segment.key] ?? segment.key,
          type: "line",
          showSymbol: false,
          data: dd.map((value, index) => [payload.timestamps[index], value == null ? null : value * 100]),
          lineStyle: { width: 1.25, color: roleColors[advanced ? "oos" : segment.key] ?? roleColors.oos, opacity: 0.8 },
          itemStyle: { color: roleColors[advanced ? "oos" : segment.key] ?? roleColors.oos },
          areaStyle: { color: roleColors[advanced ? "oos" : segment.key] ?? roleColors.oos, opacity: 0.07 },
        };
      }),
    });
  }, [segments, advanced]);

  if (summary.isLoading || detail.isLoading || !loaded) return <StateView kind="loading" />;
  if (summary.isError) return <StateView kind="failed" message={summary.error.message} onRetry={() => summary.refetch()} />;

  return (
    <div className="space-y-6">
      {!advanced ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={selected as "compare" | SegmentKey}
            onChange={setSelected}
            options={[
              { value: "is", label: "IS" },
              { value: "oos", label: "OOS" },
              { value: "holdout_live", label: "Holdout Live" },
              { value: "compare", label: "Compare" },
            ]}
          />
          <SegmentedControl
            value={capitalMode}
            onChange={setCapitalMode}
            options={[
              { value: "capital", label: "Capital" },
              { value: "rebased", label: "Rebased 100" },
            ]}
          />
        </div>
      ) : (
        <SegmentedControl
          value={capitalMode}
          onChange={setCapitalMode}
          options={[
            { value: "capital", label: "Capital" },
            { value: "rebased", label: "Rebased 100" },
          ]}
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricHero label="Final equity" value={`$${fmtMoney(heroMetrics.final_equity)}`} sub={`init $${fmtMoney(heroMetrics.initial_capital)}`} />
        <MetricHero label="Total return" value={fmtPct(heroMetrics.total_return_pct, true)} color={(heroMetrics.total_return_pct ?? 0) >= 0 ? "var(--good)" : "var(--bad)"} />
        <MetricHero label="Sharpe" value={fmtRatio(heroMetrics.sharpe)} />
        <MetricHero label="Max drawdown" value={fmtPct(heroMetrics.max_drawdown_pct)} color="var(--bad)" />
        <MetricHero label="Trades" value={fmtCount(heroMetrics.num_trades)} />
      </div>

      <ChartFigure
        figNumber={1}
        title={`Equity — ${advanced ? "stitched OOS account" : capitalMode === "capital" ? "fresh-account capital" : "rebased 100"}`}
        sourceId={advanced ? "series/stitched.parquet" : `presentation/${capitalMode === "capital" ? "calendar" : "rebased"}`}
      >
        <EChart option={equityOption} height={560} />
      </ChartFigure>

      <ChartFigure figNumber={2} title="Underwater — drawdown (presentation from equity)" sourceId="series/*">
        <EChart option={underwaterOption} height={220} />
      </ChartFigure>

      <MetricsCard metrics={metrics} advanced={advanced} />
    </div>
  );
}

function MetricsCard({ metrics, advanced }: { metrics: Record<string, unknown>; advanced: boolean }) {
  const rows: Array<{ key: string; label: string }> = [
    { key: "total_return_pct", label: "Total return" },
    { key: "cagr_pct", label: "CAGR" },
    { key: "sharpe", label: "Sharpe" },
    { key: "sortino", label: "Sortino" },
    { key: "calmar", label: "Calmar" },
    { key: "max_drawdown_pct", label: "Max DD" },
    { key: "profit_factor", label: "Profit factor" },
    { key: "num_trades", label: "Trades" },
  ];
  const segments = metrics as Record<string, Record<string, number | null>>;

  if (!advanced) {
    const columns = ["is", "oos", "holdout_live"] as const;
    return (
      <div className="card p-4">
        <div className="label mb-3">Comparison matrix — IS / OOS / Holdout Live</div>
        <table className="w-full text-[12px]">
          <thead>
            <tr>
              <th className="mono pb-2 text-left text-[11px] uppercase text-ink-faint">Metric</th>
              {columns.map((column) => (
                <th key={column} className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">
                  {SEGMENT_LABELS[column]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-line-soft hover:bg-sunken">
                <td className="py-1.5 text-ink-soft">{row.label}</td>
                {columns.map((column) => {
                  const value = segments[column]?.[row.key] ?? null;
                  return <td key={column} className="num">{value == null ? "—" : row.key === "num_trades" ? fmtCount(value) : row.key.includes("pct") ? fmtPct(value) : fmtRatio(value)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const stitched = segments.stitched ?? {};
  return (
    <div className="card p-4">
      <div className="label mb-3">Metrics — stitched OOS account</div>
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map((row) => {
            const value = stitched[row.key] ?? null;
            return (
              <tr key={row.key} className="border-t border-line-soft hover:bg-sunken">
                <td className="py-1.5 text-ink-soft">{row.label}</td>
                <td className="num font-semibold text-ink">
                  {value == null ? "—" : row.key === "num_trades" ? fmtCount(value) : row.key.includes("pct") ? fmtPct(value) : fmtRatio(value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
