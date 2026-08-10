/** Parameters: selected params + percentile, coverage, pairwise contour, parallel coordinates (§16). */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption, palette } from "../../charts/theme";
import { ChartFigure } from "../../components/ChartFigure";
import { Collapsible, DefinitionList, StateView } from "../../components/ui";
import { api } from "../../lib/api";
import type { StrategyResponse } from "../../lib/api";

export function ParametersView({ runId }: { runId: string }) {
  const parameters = useQuery({ queryKey: ["parameters", runId], queryFn: () => api.parameters(runId) });
  const trials = useQuery({ queryKey: ["trials", runId], queryFn: () => api.trials(runId, "top_n=5000") });
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });

  const selected = parameters.data?.selected.params ?? {};
  const ranges = strategies.data?.[0]?.parameter_space ?? {};
  const rows = trials.data ?? [];

  if (parameters.isLoading || trials.isLoading) return <StateView kind="loading" />;
  if (parameters.isError || trials.isError)
    return <StateView kind="failed" message="Không tải được parameter analysis" onRetry={() => void (parameters.refetch(), trials.refetch())} />;

  const paramKeys = Object.keys(selected);
  const [pairA, setPairA] = useState(paramKeys[0] ?? "");
  const [pairB, setPairB] = useState(paramKeys[1] ?? paramKeys[0] ?? "");

  const coverageOption = useMemo(
    () =>
      baseOption({
        grid: { left: 56, right: 16, top: 20, bottom: 40, containLabel: true },
        legend: { show: false },
        xAxis: { type: "value", name: "value", nameTextStyle: { color: palette.inkFaint } },
        series: paramKeys.map((key) => ({
          name: key,
          type: "bar",
          data: rows
            .map((row) => (row.params as Record<string, unknown>)?.[key])
            .filter((value) => typeof value === "number"),
          itemStyle: { color: palette.accent, opacity: 0.7 },
          barWidth: 4,
        })),
      }),
    [rows, paramKeys],
  );

  const contourOption = useMemo(() => {
    const cells: Array<[string, string, number]> = [];
    for (const row of rows) {
      const params = row.params as Record<string, unknown>;
      const a = params[pairA];
      const b = params[pairB];
      if (typeof a === "number" && typeof b === "number") {
        cells.push([String(a), String(b), row.objective as number]);
      }
    }
    return baseOption({
      grid: { left: 56, right: 40, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      visualMap: {
        min: cells.length ? Math.min(...cells.map((c) => c[2])) : 0,
        max: cells.length ? Math.max(...cells.map((c) => c[2])) : 1,
        right: 0,
        top: 20,
        calculable: true,
        textStyle: { color: palette.inkFaint, fontSize: 10 },
      },
      xAxis: { type: "category", data: [...new Set(cells.map((c) => c[0]))] },
      yAxis: { type: "category", data: [...new Set(cells.map((c) => c[1]))] },
      series: [
        {
          type: "heatmap",
          data: cells.map(([a, b, objective]) => [a, b, objective]),
          itemStyle: { borderColor: "#fff", borderWidth: 1 },
        },
      ],
    });
  }, [rows, pairA, pairB]);

  const parallelOption = useMemo(() => {
    const dims = paramKeys;
    const values: Array<(string | number)[]> = rows.slice(0, 300).map((row) => {
      const params = row.params as Record<string, unknown>;
      return dims.map((key) => (params[key] as string | number) ?? 0);
    });
    return baseOption({
      grid: { left: 16, right: 16, top: 20, bottom: 40 },
      legend: { show: false },
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
          <span className="label">Contour pair</span>
          <select className="input" value={pairA} onChange={(e) => setPairA(e.target.value)} aria-label="Param A">
            {paramKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <span className="mono text-ink-faint">×</span>
          <select className="input" value={pairB} onChange={(e) => setPairB(e.target.value)} aria-label="Param B">
            {paramKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartFigure figNumber={1} title="Coverage histogram" sourceId="wfo/trials.parquet">
            <EChart option={coverageOption} height={340} />
          </ChartFigure>
          <ChartFigure figNumber={2} title="Objective contour — parameter sensitivity" sourceId="wfo/trials.parquet">
            <EChart option={contourOption} height={340} />
          </ChartFigure>
        </div>
        <ChartFigure figNumber={3} title="Parallel coordinates — top trials" sourceId="wfo/trials.parquet">
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
