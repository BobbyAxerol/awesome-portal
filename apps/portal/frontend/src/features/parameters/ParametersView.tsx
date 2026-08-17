/** Parameters: selected params + percentile, coverage, pairwise contour, parallel coordinates (§16). */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption, palette } from "../../charts/theme";
import { ChartFigure } from "../../components/ChartFigure";
import { Collapsible, DefinitionList, StateView } from "../../components/ui";
import { api, rowParams } from "../../lib/api";
import type { StrategyResponse } from "../../lib/api";
import { tableProvenance, rowPopulation, type RunEvidence } from "../quantbt/provenance";
import { buildHistogram, buildObjectiveHeatmap, numericValues } from "./analytics";
import { activeTheme, vizTokensFor } from "../../styles/tokens";

const viz = vizTokensFor(activeTheme());

/** Server-side cap on the trials query; disclosed on every trial chart. */
const TRIAL_QUERY_CAP = 5000;

/** Rows the parallel-coordinates chart keeps. A client-side reduction. */
const PARALLEL_TOP_N = 200;

export function ParametersView({ runId }: { runId: string }) {
  const parameters = useQuery({ queryKey: ["parameters", runId], queryFn: () => api.parameters(runId) });
  const trials = useQuery({ queryKey: ["trials", runId], queryFn: () => api.trials(runId, `top_n=${TRIAL_QUERY_CAP}`) });
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const audit = useQuery({ queryKey: ["audit", runId], queryFn: () => api.audit(runId), staleTime: 60_000 });

  const selected = parameters.data?.selected.params ?? {};
  const ranges = strategies.data?.[0]?.parameter_space ?? {};
  const rows = trials.data?.rows ?? [];

  const { total: trialsTotal, returned: trialsReturned, truncated: trialsTruncated } =
    rowPopulation(trials.data);

  const manifest = (audit.data?.manifest ?? {}) as Record<string, unknown>;
  const run: RunEvidence = {
    runId,
    asOf: typeof manifest.completed_at === "string" ? manifest.completed_at : null,
    digest: typeof manifest.dataset_content_hash === "string" ? manifest.dataset_content_hash : null,
    // Declared, not inferred — see the same change in OptimizationView.
    warnings: trialsTruncated
      ? [
          `Chart vẽ ${trialsReturned}/${trialsTotal} trial của artifact ` +
            `(server cap top_n=${TRIAL_QUERY_CAP} theo objective).`,
        ]
      : undefined,
  };

  const paramKeys = Object.keys(selected);
  const numericKeys = paramKeys.filter((key) => rows.some((row) => typeof rowParams(row)[key] === "number"));
  const [pairA, setPairA] = useState(paramKeys[0] ?? "");
  const [pairB, setPairB] = useState(paramKeys[1] ?? paramKeys[0] ?? "");
  const [distributionParam, setDistributionParam] = useState(paramKeys[0] ?? "");

  useEffect(() => {
    if (!distributionParam && numericKeys.length) setDistributionParam(numericKeys[0]);
    if (!pairA && numericKeys.length) setPairA(numericKeys[0]);
    if (!pairB && numericKeys.length) setPairB(numericKeys[1] ?? numericKeys[0]);
  }, [distributionParam, numericKeys, pairA, pairB]);

  /** Trials each chart actually consumes — the numerator of its provenance line. */
  const distributionPlotted = useMemo(
    () => numericValues(rows, distributionParam).length,
    [rows, distributionParam],
  );
  const contourPlotted = useMemo(
    // Every cell aggregates `count` trials, so the trials that reached the
    // heatmap is the sum of the cell counts, not the number of cells.
    () => buildObjectiveHeatmap(rows, pairA, pairB).reduce((total, cell) => total + cell.count, 0),
    [rows, pairA, pairB],
  );

  const coverageOption = useMemo(() => {
    const bins = buildHistogram(numericValues(rows, distributionParam));
    return baseOption({
        grid: { left: 56, right: 16, top: 20, bottom: 40, containLabel: true },
        legend: { show: false },
        dataZoom: [],
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: bins.map((bin) => Number(bin.center.toPrecision(5))), axisLabel: { hideOverlap: true } },
        yAxis: { type: "value", minInterval: 1 },
        series: [{
          name: distributionParam,
          type: "bar",
          data: bins.map((bin) => bin.count),
          itemStyle: { color: palette.accent, opacity: 0.7 },
        }],
      });
  }, [distributionParam, rows]);

  const contourOption = useMemo(() => {
    const cells = buildObjectiveHeatmap(rows, pairA, pairB);
    const xValues = [...new Set(cells.map((cell) => cell.x))].sort((a, b) => a - b);
    const yValues = [...new Set(cells.map((cell) => cell.y))].sort((a, b) => a - b);
    return baseOption({
      grid: { left: 56, right: 40, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      dataZoom: [],
      visualMap: {
        min: cells.length ? Math.min(...cells.map((cell) => cell.objective)) : 0,
        max: cells.length ? Math.max(...cells.map((cell) => cell.objective)) : 1,
        right: 0,
        top: 20,
        calculable: true,
        textStyle: { color: palette.inkFaint, fontSize: 10 },
      },
      tooltip: { trigger: "item", formatter: (params: unknown) => { const data = (params as { data: [number, number, number, number] }).data; return `${pairA}=${xValues[data[0]]}<br/>${pairB}=${yValues[data[1]]}<br/>mean objective=${data[2].toFixed(4)}<br/>n=${data[3]}`; } },
      xAxis: { type: "category", data: xValues },
      yAxis: { type: "category", data: yValues },
      series: [
        {
          type: "heatmap",
          data: cells.map((cell) => [xValues.indexOf(cell.x), yValues.indexOf(cell.y), cell.objective, cell.count]),
          itemStyle: { borderColor: viz.cellBorder, borderWidth: 1 },
        },
      ],
    });
  }, [rows, pairA, pairB]);

  const parallelOption = useMemo(() => {
    const dims = paramKeys;
    const topRows = [...rows].sort((a, b) => Number(b.objective ?? -Infinity) - Number(a.objective ?? -Infinity)).slice(0, PARALLEL_TOP_N);
    const values: Array<(string | number)[]> = topRows.map((row) => {
      const params = rowParams(row);
      return dims.map((key) => (params[key] as string | number) ?? 0);
    });
    return baseOption({
      grid: { left: 16, right: 16, top: 20, bottom: 40 },
      legend: { show: false },
      dataZoom: [],
      parallelAxis: dims.map((key, index) => ({
        dim: index,
        name: key,
        nameTextStyle: { color: palette.inkFaint, fontSize: 10 },
      })),
      parallel: { top: 30, left: 40, right: 40, bottom: 40 },
      series: [
        {
          type: "parallel",
          lineStyle: { color: palette.accent, opacity: 0.25, width: 1 },
          data: values,
        },
      ],
    });
  }, [rows, paramKeys]);

  if (parameters.isLoading || trials.isLoading) return <StateView kind="loading" />;
  if (parameters.isError || trials.isError)
    return <StateView kind="failed" message="Không tải được parameter analysis" onRetry={() => void (parameters.refetch(), trials.refetch())} />;

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="label mb-3">Selected params — frozen θ*</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {paramKeys.map((key) => {
            const value = selected[key];
            const range = ranges[key];
            const percentile = range
              ? Math.round(((value - range.low) / Math.max(1, range.high - range.low)) * 100)
              : null;
            return (
              <div key={key}>
                <div className="label">{key}</div>
                <div className="mono text-[16px] font-semibold text-ink">{value}</div>
                <div className="mono text-[10px] text-ink-faint">p{percentile ?? "—"} in search range</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="label">Distribution</span>
          <select className="input" value={distributionParam} onChange={(e) => setDistributionParam(e.target.value)} aria-label="Distribution parameter">
            {numericKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <span className="label ml-3">Sensitivity pair</span>
          <select className="input" value={pairA} onChange={(e) => setPairA(e.target.value)} aria-label="Param A">
            {numericKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <span className="mono text-ink-faint">×</span>
          <select className="input" value={pairB} onChange={(e) => setPairB(e.target.value)} aria-label="Param B">
            {numericKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartFigure
            figNumber={1}
            title={`Trial distribution — ${distributionParam || "parameter"}`}
            provenance={tableProvenance(run, {
              source: "wfo/trials.parquet",
              segment: "is",
              units: `${distributionParam || "parameter"} (số trial mỗi bin)`,
              available: trialsTotal,
              plotted: distributionPlotted,
              reduction: `bỏ trial không có giá trị số cho ${distributionParam || "parameter"}`,
            })}
          >
            <EChart option={coverageOption} height={340} />
          </ChartFigure>
          <ChartFigure
            figNumber={2}
            title="Objective contour — parameter sensitivity"
            note="Mỗi ô là objective trung bình của các trial rơi vào cặp giá trị đó; ô trống là cặp chưa có trial nào, không phải objective bằng 0."
            provenance={tableProvenance(run, {
              source: "wfo/trials.parquet",
              segment: "is",
              units: "objective trung bình",
              available: trialsTotal,
              plotted: contourPlotted,
              reduction: `bỏ trial thiếu ${pairA} hoặc ${pairB}`,
            })}
          >
            <EChart option={contourOption} height={340} />
          </ChartFigure>
        </div>
        <ChartFigure
          figNumber={3}
          title={`Parallel coordinates — top ${PARALLEL_TOP_N} trials by objective`}
          provenance={tableProvenance(run, {
            source: "wfo/trials.parquet",
            segment: "is",
            units: "giá trị parameter đã chuẩn hoá",
            available: trialsTotal,
            plotted: Math.min(rows.length, PARALLEL_TOP_N),
            // A client-side top-N, named as one: the tail is not missing from
            // the artifact, it is simply not drawn.
            reduction: `client top-${PARALLEL_TOP_N} theo objective`,
          })}
        >
          <EChart option={parallelOption} height={420} />
        </ChartFigure>
      </div>

      <StructuralContract strategy={strategies.data?.[0]} />
    </div>
  );
}

function StructuralContract({ strategy }: { strategy: StrategyResponse | undefined }) {
  const contract = strategy?.structural_contract ?? {};
  return (
    <div className="card p-4">
      <Collapsible title="Structural contract — immutable thesis" defaultOpen={false}>
        <DefinitionList
          rows={Object.entries(contract).map(([key, value]) => [key, String(value)] as [string, string])}
        />
      </Collapsible>
    </div>
  );
}
