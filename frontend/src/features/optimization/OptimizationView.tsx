/** Optimization: process timeline, trial/candidate scatter, decay lollipop, convergence, table (§15). */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption, palette } from "../../charts/theme";
import type { EChartsOption } from "echarts";
import { ChartFigure } from "../../components/ChartFigure";
import { Collapsible, DefinitionList, StateView } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtDecay, fmtRatio } from "../../lib/format";

const PROCESS_STAGES = [
  "Optimize IS",
  "Top candidates",
  "Replay OOS",
  "Select",
  "Freeze",
  "Evaluate",
];

export function OptimizationView({ runId }: { runId: string }) {
  const trials = useQuery({ queryKey: ["trials", runId], queryFn: () => api.trials(runId, "top_n=5000") });
  const candidates = useQuery({ queryKey: ["candidates", runId], queryFn: () => api.candidates(runId) });
  const trace = useQuery({ queryKey: ["trace", runId], queryFn: () => api.trace(runId) });
  const [selectedTrial, setSelectedTrial] = useState<number | null>(null);

  const rows = useMemo(() => trials.data ?? [], [trials.data]);
  const candidateRows = useMemo(() => candidates.data ?? [], [candidates.data]);
  const selectedId =
    selectedTrial ??
    ((trace.data?.selected_trial_id as number | null | undefined) ?? null) ??
    ((candidateRows[0]?.trial_id as number | null | undefined) ?? null);

  if (trials.isLoading || candidates.isLoading) return <StateView kind="loading" />;
  if (trials.isError || candidates.isError) return <StateView kind="failed" message="Không tải được dữ liệu optimization" onRetry={() => void (trials.refetch(), candidates.refetch())} />;

  const trialScatter = useMemo(() => {
    const data: Array<[number, number]> = rows
      .filter((row) => typeof row.objective === "number")
      .map((row) => [row.trial_id as number, row.objective as number]);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      tooltip: { trigger: "item", formatter: (p: { data: [number, number] }) => `trial #${p.data[0]} · ${p.data[1].toFixed(3)}` },
      xAxis: { type: "value", name: "trial id", nameTextStyle: { color: palette.inkFaint } },
      yAxis: { type: "value", name: "objective", nameTextStyle: { color: palette.inkFaint } },
      series: [
        {
          type: "scatter",
          symbolSize: (value: number[]) => (value[0] === selectedId ? 12 : 7),
          data,
          itemStyle: {
            color: (params: { data: [number, number] }) =>
              params.data[0] === selectedId ? palette.ink : palette.accent,
            opacity: (params: { data: [number, number] }) => (params.data[0] === selectedId ? 1 : 0.6),
          },
        },
      ],
    } as unknown as EChartsOption);
  }, [rows, selectedId]);

  const candidateScatter = useMemo(() => {
    const data: Array<[number, number]> = candidateRows
      .filter((row) => typeof row.mean_is_sharpe === "number" && typeof row.mean_oos_sharpe === "number")
      .map((row) => [row.mean_is_sharpe as number, row.mean_oos_sharpe as number]);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      tooltip: { trigger: "item" },
      xAxis: { type: "value", name: "IS Sharpe", nameTextStyle: { color: palette.inkFaint } },
      yAxis: { type: "value", name: "OOS Sharpe", nameTextStyle: { color: palette.inkFaint } },
      series: [
        {
          type: "scatter",
          symbolSize: 8,
          data,
          itemStyle: { color: palette.accent, opacity: 0.75 },
        },
      ],
    });
  }, [candidateRows]);

  const decayData = useMemo(
    () =>
      candidateRows
        .map((row, index) => ({ index, id: row.trial_id as number, decay: row.mean_decay as number }))
        .filter((row) => typeof row.decay === "number"),
    [candidateRows],
  );
  const decayOption = useMemo(
    () =>
      baseOption({
        grid: { left: 56, right: 20, top: 20, bottom: 40, containLabel: true },
        legend: { show: false },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: decayData.map((row) => `#${row.id}`) },
        series: [
          {
            type: "bar",
            data: decayData.map((row) => row.decay),
            itemStyle: {
              color: (params: { dataIndex: number }) =>
                decayData[params.dataIndex].id === selectedId ? palette.ink : palette.accent,
              opacity: (params: { dataIndex: number }) =>
                decayData[params.dataIndex].id === selectedId ? 1 : 0.75,
            },
            barWidth: 14,
          },
        ],
      } as EChartsOption),
    [decayData, selectedId],
  );

  const convergenceOption = useMemo(() => {
    let best = -Infinity;
    const data: Array<[number, number | null]> = rows.map((row, index) => {
      if (typeof row.objective === "number") best = Math.max(best, row.objective);
      return [index, best === -Infinity ? null : best];
    });
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      xAxis: { type: "value", name: "trial", nameTextStyle: { color: palette.inkFaint } },
      series: [{ type: "line", showSymbol: false, data, lineStyle: { color: palette.accent, width: 1.75 } }],
    });
  }, [rows]);

  return (
    <div className="space-y-6">
      <ProcessTimeline />
      <SelectionFunnel rows={rows} candidates={candidateRows} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartFigure figNumber={1} title="Trials — IS objective theo trial id" sourceId="wfo/trials.parquet">
          <EChart option={trialScatter} height={360} />
        </ChartFigure>
        <ChartFigure figNumber={2} title="Candidates — IS Sharpe vs OOS Sharpe" sourceId="wfo/candidates.parquet">
          <EChart option={candidateScatter} height={360} />
        </ChartFigure>
        <ChartFigure figNumber={3} title="Decay lollipop — candidate decay" sourceId="wfo/candidates.parquet">
          <EChart option={decayOption} height={320} />
        </ChartFigure>
        <ChartFigure figNumber={4} title="Best-so-far convergence" sourceId="wfo/trials.parquet">
          <EChart option={convergenceOption} height={320} />
        </ChartFigure>
      </div>

      <TrialTable rows={rows} selectedId={selectedId} onSelect={setSelectedTrial} />

      <div className="card p-4">
        <Collapsible title="Selection trace" defaultOpen={Boolean(trace.data)}>
          <DefinitionList
            rows={[
              ["Selected trial", trace.data?.selected_trial_id != null ? `#${String(trace.data.selected_trial_id)}` : "—"],
              ["Source", String(trace.data?.source ?? "—")],
              [
                "Per-trial breakdown",
                String(
                  (trace.data?.capabilities as Record<string, unknown> | undefined)
                    ?.per_trial_selection_breakdown ?? "—",
                ),
              ],
            ]}
          />
        </Collapsible>
      </div>
    </div>
  );
}

function ProcessTimeline() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PROCESS_STAGES.map((stage, index) => (
        <span key={stage} className="flex items-center gap-1.5">
          <span className="mono rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-[11px] text-accent">
            {stage}
          </span>
          {index < PROCESS_STAGES.length - 1 ? <span className="mono text-ink-faint">→</span> : null}
        </span>
      ))}
    </div>
  );
}

function SelectionFunnel({ rows, candidates }: { rows: Record<string, unknown>[]; candidates: Record<string, unknown>[] }) {
  const valid = rows.filter((row) => row.pruned !== true).length;
  const selected = candidates.length ? 1 : 0;
  const steps = [
    { label: "sampled", value: rows.length },
    { label: "valid", value: valid },
    { label: "candidates", value: candidates.length },
    { label: "selected", value: selected },
  ];
  return (
    <div className="card flex flex-wrap items-center gap-2 p-4">
      {steps.map((step, index) => (
        <span key={step.label} className="flex items-center gap-2">
          <span className="flex flex-col">
            <span className="label">{step.label}</span>
            <span className="mono text-[16px] font-semibold text-ink">{step.value}</span>
          </span>
          {index < steps.length - 1 ? <span className="mono text-ink-faint">→</span> : null}
        </span>
      ))}
    </div>
  );
}

function TrialTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: Record<string, unknown>[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="card overflow-x-auto p-4">
      <div className="label mb-2">Trial explorer</div>
      <table className="w-full min-w-[720px] text-[12px]">
        <thead>
          <tr>
            <th className="mono pb-2 text-left text-[11px] uppercase text-ink-faint">trial</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">objective</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">IS Sharpe</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">OOS Sharpe</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">decay</th>
            <th className="mono pb-2 text-left text-[11px] uppercase text-ink-faint">params</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row) => {
            const id = row.trial_id as number;
            return (
              <tr
                key={id}
                className={`cursor-pointer border-t border-line-soft hover:bg-sunken ${
                  id === selectedId ? "bg-accent-soft" : ""
                }`}
                onClick={() => onSelect(id)}
              >
                <td className="num py-1.5">{id}</td>
                <td className="num">{fmtRatio(row.objective as number)}</td>
                <td className="num">{fmtRatio(row.mean_is_sharpe as number)}</td>
                <td className="num">{fmtRatio(row.mean_oos_sharpe as number)}</td>
                <td className="num">{fmtDecay(row.mean_decay as number)}</td>
                <td className="max-w-[280px] truncate text-ink-faint">
                  {JSON.stringify(row.params)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
