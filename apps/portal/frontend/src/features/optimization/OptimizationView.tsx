/** Optimization: process timeline, trial/candidate scatter, decay lollipop, convergence, table (§15). */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption, palette } from "../../charts/theme";
import type { EChartsOption } from "echarts";
import { ChartFigure } from "../../components/ChartFigure";
import { Collapsible, DefinitionList, StateView } from "../../components/ui";
import { FoldGantt } from "../../components/FoldGantt";
import { api, rowParams } from "../../lib/api";
import { fmtDecay, fmtRatio } from "../../lib/format";
import { tableProvenance, type RunEvidence } from "../quantbt/provenance";

/** Server-side cap on the trials query; disclosed on every trial chart. */
const TRIAL_QUERY_CAP = 5000;

const PROCESS_STAGES = [
  "Optimize IS",
  "Top candidates",
  "Replay OOS",
  "Select",
  "Freeze",
  "Evaluate",
];

export function OptimizationView({ runId }: { runId: string }) {
  const trials = useQuery({ queryKey: ["trials", runId], queryFn: () => api.trials(runId, `top_n=${TRIAL_QUERY_CAP}`) });
  const foldPlan = useQuery({ queryKey: ["fold-plan", runId], queryFn: () => api.foldPlan(runId), retry: 1 });
  const detail = useQuery({ queryKey: ["run", runId], queryFn: () => api.getRun(runId) });
  const candidates = useQuery({ queryKey: ["candidates", runId], queryFn: () => api.candidates(runId) });
  const trace = useQuery({ queryKey: ["trace", runId], queryFn: () => api.trace(runId) });
  const folds = useQuery({ queryKey: ["folds", runId], queryFn: () => api.folds(runId) });
  const audit = useQuery({ queryKey: ["audit", runId], queryFn: () => api.audit(runId), staleTime: 60_000 });
  const [selectedTrial, setSelectedTrial] = useState<number | null>(null);

  const manifest = (audit.data?.manifest ?? {}) as Record<string, unknown>;
  const run: RunEvidence = {
    runId,
    asOf: typeof manifest.completed_at === "string" ? manifest.completed_at : null,
    digest: typeof manifest.dataset_content_hash === "string" ? manifest.dataset_content_hash : null,
    // The trials query asks the server for the top 5.000 by objective. That
    // cap is a property of the chart's data, not a detail of the fetch, so it
    // is stated wherever a trial chart is drawn (v0.5 §12.2).
    warnings:
      (trials.data?.length ?? 0) >= TRIAL_QUERY_CAP
        ? [`Server trả tối đa ${TRIAL_QUERY_CAP} trial theo objective — có thể còn trial ngoài tập này.`]
        : undefined,
  };

  const rows = useMemo(() => {
    const unique = new Map<string, Record<string, unknown>>();
    for (const row of trials.data ?? []) {
      const study = row.study_id ?? row.schedule_fold_id ?? "global";
      const key = `${String(study)}:${String(row.trial_id)}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    return [...unique.values()];
  }, [trials.data]);
  const candidateRows = useMemo(() => candidates.data ?? [], [candidates.data]);
  const selectedId =
    selectedTrial ??
    ((trace.data?.selected_trial_id as number | null | undefined) ?? null) ??
    ((candidateRows[0]?.trial_id as number | null | undefined) ?? (candidateRows[0]?.source_trial_id as number | null | undefined) ?? null);

  const trialScatter = useMemo(() => {
    const data: Array<[number, number, number, number, number]> = rows
      .filter((row) => typeof row.objective === "number")
      .map((row) => [row.trial_id as number, row.objective as number, row.mean_is_sharpe as number, row.mean_oos_sharpe as number, row.mean_decay as number]);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      dataZoom: [],
      tooltip: { trigger: "item", formatter: (p: { data: number[] }) => `trial #${p.data[0]}<br/>objective ${fmtRatio(p.data[1])}<br/>IS ${fmtRatio(p.data[2])} · OOS ${fmtRatio(p.data[3])}<br/>decay ${fmtDecay(p.data[4])}` },
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      series: [
        {
          type: "scatter",
          symbolSize: (value: number[]) => (value[0] === selectedId ? 12 : 7),
          data,
          itemStyle: {
            color: (params: { data: number[] }) =>
              params.data[0] === selectedId ? palette.ink : palette.accent,
            opacity: (params: { data: number[] }) => (params.data[0] === selectedId ? 1 : 0.6),
          },
        },
      ],
    } as unknown as EChartsOption);
  }, [rows, selectedId]);

  /** Rows each chart actually draws — the denominator of its provenance line. */
  const trialsPlotted = useMemo(
    () => rows.filter((row) => typeof row.objective === "number").length,
    [rows],
  );
  const candidatesPlotted = useMemo(
    () =>
      candidateRows.filter(
        (row) => typeof row.mean_is_sharpe === "number" && typeof row.mean_oos_sharpe === "number",
      ).length,
    [candidateRows],
  );

  const candidateScatter = useMemo(() => {
    const data: Array<[number, number, number]> = candidateRows
      .filter((row) => typeof row.mean_is_sharpe === "number" && typeof row.mean_oos_sharpe === "number")
      .map((row) => [row.mean_is_sharpe as number, row.mean_oos_sharpe as number, Number(row.trial_id ?? row.source_trial_id)]);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      dataZoom: [],
      tooltip: { trigger: "item", formatter: (params: unknown) => { const data = (params as { data: number[] }).data; return `trial #${data[2]}<br/>IS ${fmtRatio(data[0])}<br/>OOS ${fmtRatio(data[1])}`; } },
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      series: [
        {
          type: "scatter",
          symbolSize: (value: number[]) => (value[2] === selectedId ? 12 : 8),
          data,
          itemStyle: { color: (params: unknown) => (params as { data: number[] }).data[2] === selectedId ? palette.ink : palette.accent, opacity: 0.75 },
        },
      ],
    });
  }, [candidateRows, selectedId]);

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
        dataZoom: [],
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
      dataZoom: [],
      xAxis: { type: "value" },
      series: [{ type: "line", showSymbol: false, data, lineStyle: { color: palette.accent, width: 1.75 } }],
    });
  }, [rows]);

  if (trials.isLoading || candidates.isLoading) return <StateView kind="loading" />;
  if (trials.isError || candidates.isError) return <StateView kind="failed" message="Không tải được dữ liệu optimization" onRetry={() => void (trials.refetch(), candidates.refetch())} />;

  const showFoldGantt =
    foldPlan.data?.protocol === "advanced_walk_forward" &&
    (foldPlan.data.folds.length ?? 0) > 0 &&
    detail.data?.protocol === "advanced_walk_forward";

  return (
    <div className="space-y-6">
      {showFoldGantt ? <FoldGantt plan={foldPlan.data!} studyStarts={0} bestByStudy={[]} running={false} /> : null}
      <ProcessTimeline />
      <SelectionFunnel rows={rows} candidates={candidateRows} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartFigure
          figNumber={1}
          title="Trials — IS objective theo trial id"
          provenance={tableProvenance(run, {
            source: "wfo/trials.parquet",
            segment: "is",
            units: "objective",
            available: rows.length,
            plotted: trialsPlotted,
            reduction: "bỏ trial chưa có objective",
          })}
        >
          <EChart option={trialScatter} height={360} />
        </ChartFigure>
        <ChartFigure
          figNumber={2}
          title="Candidates — IS Sharpe vs OOS Sharpe"
          provenance={tableProvenance(run, {
            source: "wfo/candidates.parquet",
            segment: "is+oos",
            units: "Sharpe (annualized)",
            available: candidateRows.length,
            plotted: candidatesPlotted,
            reduction: "bỏ candidate thiếu IS hoặc OOS Sharpe",
          })}
        >
          <EChart option={candidateScatter} height={360} />
        </ChartFigure>
        <ChartFigure
          figNumber={3}
          title="Decay lollipop — candidate decay"
          provenance={tableProvenance(run, {
            source: "wfo/candidates.parquet",
            segment: "is→oos",
            units: "decay",
            available: candidateRows.length,
            plotted: decayData.length,
            reduction: "bỏ candidate chưa có mean_decay",
          })}
        >
          <EChart option={decayOption} height={320} />
        </ChartFigure>
        <ChartFigure
          figNumber={4}
          title="Best-so-far convergence"
          note="Đường best-so-far chạy theo thứ tự trial đã tải, không phải theo thời gian thực của study."
          provenance={tableProvenance(run, {
            source: "wfo/trials.parquet",
            segment: "is",
            units: "objective",
            available: rows.length,
            plotted: rows.length,
          })}
        >
          <EChart option={convergenceOption} height={320} />
        </ChartFigure>
      </div>

      <TrialTable rows={rows} selectedId={selectedId} onSelect={setSelectedTrial} />
      {folds.data?.length ? <FoldTable rows={folds.data} /> : null}

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
          {rows.slice(0, 200).map((row, index) => {
            const id = row.trial_id as number;
            return (
              <tr
                key={`${String(row.study_id ?? row.schedule_fold_id ?? "global")}-${id}-${index}`}
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
                  {JSON.stringify(rowParams(row))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FoldTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <div className="card overflow-x-auto p-4">
      <div className="label mb-2">Fold map</div>
      <table className="w-full min-w-[760px] text-[12px]">
        <thead><tr>{["fold", "train start", "train end", "test start", "test end", "train bars", "test bars"].map((label) => <th key={label} className="mono pb-2 text-left text-[11px] uppercase text-ink-faint">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${String(row.fold_id)}-${index}`} className="border-t border-line-soft">
          <td className="num py-1.5">{String(row.fold_id ?? index)}</td>
          <td className="mono text-[11px]">{shortDate(row.train_start)}</td>
          <td className="mono text-[11px]">{shortDate(row.train_end)}</td>
          <td className="mono text-[11px]">{shortDate(row.test_start)}</td>
          <td className="mono text-[11px]">{shortDate(row.test_end)}</td>
          <td className="num">{String(row.train_bars ?? "—")}</td>
          <td className="num">{String(row.test_bars ?? "—")}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

function shortDate(value: unknown): string {
  if (value == null) return "—";
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? String(value);
}
