/** Overview: KPI hero, segment equity compare, underwater, heatmap, comparison matrix, verdict chain (§14). */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption, roleColors } from "../../charts/theme";
import { ChartFigure } from "../../components/ChartFigure";
import { Badge, MetricHero, SegmentedControl, StateView } from "../../components/ui";
import { api, type SeriesPayload } from "../../lib/api";
import { fmtCount, fmtDelta, fmtMoney, fmtPct, fmtRatio } from "../../lib/format";

const SEGMENTS = ["is", "oos", "holdout_live"] as const;
type SegmentKey = (typeof SEGMENTS)[number];

function useSegmentSeries(runId: string) {
  const queries = SEGMENTS.map((segment) =>
    useQuery({
      queryKey: ["series", runId, segment],
      queryFn: () => api.series(runId, segment, 3000),
      staleTime: 60_000,
    }),
  );
  return queries;
}

export function OverviewView({ runId }: { runId: string }) {
  const summary = useQuery({ queryKey: ["summary", runId], queryFn: () => api.summary(runId) });
  const seriesQueries = useSegmentSeries(runId);
  const [selected, setSelected] = useState<SegmentKey | "compare">("compare");
  const [capitalMode, setCapitalMode] = useState<"capital" | "rebased">("capital");
  const presentation = useQuery({
    queryKey: ["presentation", runId, capitalMode],
    queryFn: () => api.presentation(runId, capitalMode === "capital" ? "calendar" : "rebased", 5000),
  });

  const segments = useMemo(() => {
    const out: Array<{ key: SegmentKey; series: SeriesPayload | undefined }> = [];
    for (let i = 0; i < SEGMENTS.length; i += 1) {
      out.push({ key: SEGMENTS[i], series: seriesQueries[i].data });
    }
    return out;
  }, [seriesQueries]);

  const metrics = summary.data?.metrics.segments;
  const loaded = segments.every((segment) => segment.series) && Boolean(metrics) && Boolean(presentation.data);

  const equityOption = useMemo(() => {
    const payload = presentation.data;
    const series = SEGMENTS
      .filter((key) => selected === "compare" || key === selected)
      .map((key) => {
        const values = payload?.series[`${key}_equity`] ?? [];
        const data = values.map((value, index) => [payload?.timestamps[index], value]);
        return {
          name: key === "holdout_live" ? "Holdout Live" : key.toUpperCase(),
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
      yAxis: {
        type: "value",
        axisLabel: { color: "var(--ink-faint)", fontSize: 11 },
        splitLine: { lineStyle: { color: "var(--line-soft)", type: "dashed" } },
      },
      series,
    });
  }, [presentation.data, selected]);

  const underwaterOption = useMemo(() => {
    const active = (selected === "compare" ? segments : segments.filter((segment) => segment.key === selected)).filter((segment) => segment.series);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 48, containLabel: true },
      legend: { show: false },
      series: active.map((segment) => {
        const payload = segment.series!;
        const dd = payload.series.drawdown ?? [];
        return {
          name: segment.key === "holdout_live" ? "Holdout Live" : segment.key.toUpperCase(),
          type: "line",
          showSymbol: false,
          data: dd.map((value, index) => [payload.timestamps[index], value == null ? null : value * 100]),
          lineStyle: { width: 1.25, color: roleColors[segment.key], opacity: 0.8 },
          itemStyle: { color: roleColors[segment.key] },
          areaStyle: { color: roleColors[segment.key], opacity: 0.07 },
        };
      }),
    });
  }, [segments, selected]);

  const heroMetrics = selected === "compare" ? (metrics?.holdout_live ?? {}) : (metrics?.[selected] ?? {});

  if (summary.isLoading || presentation.isLoading || !loaded) return <StateView kind="loading" />;
  if (summary.isError || presentation.isError) return <StateView kind="failed" message={summary.error?.message ?? presentation.error?.message} onRetry={() => void (summary.refetch(), presentation.refetch())} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={selected}
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricHero label="Final equity" value={`$${fmtMoney(heroMetrics.final_equity)}`} sub={`init $${fmtMoney(heroMetrics.initial_capital)}`} />
        <MetricHero label="Total return" value={fmtPct(heroMetrics.total_return_pct, true)} color={(heroMetrics.total_return_pct ?? 0) >= 0 ? "var(--good)" : "var(--bad)"} />
        <MetricHero label="Sharpe" value={fmtRatio(heroMetrics.sharpe)} />
        <MetricHero label="Max drawdown" value={fmtPct(heroMetrics.max_drawdown_pct)} color="var(--bad)" />
        <MetricHero label="Trades" value={fmtCount(heroMetrics.num_trades)} />
      </div>

      <ChartFigure figNumber={1} title={`Equity — ${capitalMode === "capital" ? "fresh-account capital" : "rebased 100"}`} sourceId={`presentation/${capitalMode === "capital" ? "calendar" : "rebased"}`}>
        <EChart option={equityOption} height={420} />
      </ChartFigure>

      <ChartFigure figNumber={2} title="Underwater — drawdown (presentation from equity)" sourceId="series/*">
        <EChart option={underwaterOption} height={160} />
      </ChartFigure>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ComparisonMatrix metrics={metrics ?? {}} />
        <VerdictChain runId={runId} selected={summary.data?.selected_params} />
      </div>
    </div>
  );
}

function ComparisonMatrix({ metrics }: { metrics: Record<string, Record<string, number | null>> }) {
  const rows: Array<{ key: string; label: string; fmt: (v: number | null) => string }> = [
    { key: "total_return_pct", label: "Total return", fmt: (v) => fmtPct(v, true) },
    { key: "cagr_pct", label: "CAGR", fmt: (v) => fmtPct(v, true) },
    { key: "sharpe", label: "Sharpe", fmt: (v) => fmtRatio(v) },
    { key: "sortino", label: "Sortino", fmt: (v) => fmtRatio(v) },
    { key: "calmar", label: "Calmar", fmt: (v) => fmtRatio(v) },
    { key: "max_drawdown_pct", label: "Max DD", fmt: (v) => fmtPct(v) },
    { key: "profit_factor", label: "Profit factor", fmt: (v) => fmtRatio(v) },
    { key: "num_trades", label: "Trades", fmt: (v) => fmtCount(v) },
  ];
  const values = (segment: string, key: string) => metrics[segment]?.[key] ?? null;

  return (
    <div className="card p-4">
      <div className="label mb-3">Comparison matrix — IS / OOS / Holdout Live</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr>
            <th className="mono pb-2 text-left text-[11px] uppercase text-ink-faint">Metric</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">IS</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">OOS</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">Holdout</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">OOS→Hold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const is = values("is", row.key);
            const oos = values("oos", row.key);
            const hold = values("holdout_live", row.key);
            const delta = is != null && hold != null && oos != null ? hold - oos : null;
            const better =
              delta != null && (row.key === "max_drawdown_pct" ? delta < 0 : delta > 0);
            return (
              <tr key={row.key} className="border-t border-line-soft hover:bg-sunken">
                <td className="py-1.5 text-ink-soft">{row.label}</td>
                <td className="num">{row.fmt(is)}</td>
                <td className="num">{row.fmt(oos)}</td>
                <td className="num font-semibold text-ink">{row.fmt(hold)}</td>
                <td className={`num ${better ? "text-good" : delta != null ? "text-bad" : ""}`}>
                  {delta != null ? fmtDelta(delta) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VerdictChain({
  runId,
  selected,
}: {
  runId: string;
  selected: { params: Record<string, number>; trial_id: number | null } | undefined;
}) {
  const trials = useQuery({ queryKey: ["trials", runId], queryFn: () => api.trials(runId, "top_n=1000") });
  const nTrials = trials.data?.length ?? null;
  const nodes = [
    { label: "IS search", value: nTrials == null ? "—" : `${fmtCount(nTrials)} trials` },
    { label: "OOS replay", value: "candidates" },
    { label: "Frozen θ*", value: selected?.trial_id != null ? `trial #${selected.trial_id}` : "—" },
    { label: "Holdout verdict", value: "fresh account" },
  ];
  return (
    <div className="card p-4">
      <div className="label mb-3">Selection provenance</div>
      <div className="flex flex-wrap items-center gap-2">
        {nodes.map((node, index) => (
          <span key={node.label} className="flex items-center gap-2">
            <span className="card flex flex-col px-3 py-2">
              <span className="label">{node.label}</span>
              <span className="mono mt-0.5 text-[13px] font-semibold text-ink">{node.value}</span>
            </span>
            {index < nodes.length - 1 ? <span className="mono text-ink-faint">→</span> : null}
          </span>
        ))}
      </div>
      {selected ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(selected.params).map(([key, value]) => (
            <span key={key} className="chip">
              {key}={value}
            </span>
          ))}
        </div>
      ) : null}
      <Badge tone="pass">frozen · immutable</Badge>
    </div>
  );
}
