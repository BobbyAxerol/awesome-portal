/**
 * Parameters — the frozen set, and what the engine claims about it (§16).
 *
 * `selected_params.json` publishes far more than eight numbers: it states the
 * trial the set came from, when it was frozen, its hash, whether the OOS segment
 * was used while selecting, and what kind of validation the claim rests on.
 * The screen used to render only the numbers, which let a reader take an OOS
 * Sharpe at face value while `oos_used_for_selection: true` sat unread in the
 * same payload. Those claims now lead, and the caveat is stated where the
 * numbers are.
 *
 * The strategy is resolved by the run's own `strategy_id`. It used to be
 * `strategies[0]` — the first strategy the API happened to list — so the search
 * range every percentile was measured against, and the "immutable thesis" panel
 * at the bottom, belonged to whichever strategy sorted first rather than to the
 * run on screen. With one strategy registered that was invisible; with an
 * imported alpha it is wrong.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption } from "../../charts/theme";
import { useChartTheme } from "../../charts/useChartTheme";
import { ChartFigure } from "../../components/ChartFigure";
import { Collapsible, DefinitionList, ResultsSkeleton, StateView } from "../../components/ui";
import { api, rowParams } from "../../lib/api";
import type { StrategyResponse } from "../../lib/api";
import { fmtTimestamp } from "../../lib/format";
import { artifactExplanation, artifactStateKind, artifactTable } from "../quantbt/artifacts";
import { tableProvenance, type RunEvidence } from "../quantbt/provenance";
import { buildHistogram, buildObjectiveHeatmap, numericValues } from "./analytics";
import { vizTokensFor } from "../../styles/tokens";

/** Server-side cap on the trials query; disclosed on every trial chart. */
const TRIAL_QUERY_CAP = 5000;

/** Rows the parallel-coordinates chart keeps. A client-side reduction. */
const PARALLEL_TOP_N = 200;

type ParameterRange = { low: number; high: number; step: number };

/** Where a frozen value sits inside its declared search range. */
type RangePosition =
  | { kind: "inside"; percentile: number }
  | { kind: "outside" }
  | { kind: "degenerate" }
  | { kind: "unknown" };

/**
 * Position of `value` within `[low, high]`, as a percentage.
 *
 * The previous form divided by `Math.max(1, high - low)`, a guard against a
 * zero span that silently rescaled every range narrower than 1: `rvol` frozen at
 * the top of `[1.2, 1.6]` printed "p40" instead of p100. A zero-width range has
 * no percentile at all, and says so rather than borrowing a denominator.
 */
export function rangePosition(value: number, range: ParameterRange | undefined): RangePosition {
  if (!range || typeof range.low !== "number" || typeof range.high !== "number") {
    return { kind: "unknown" };
  }
  const span = range.high - range.low;
  if (!(span > 0)) return { kind: "degenerate" };
  if (value < range.low || value > range.high) return { kind: "outside" };
  return { kind: "inside", percentile: Math.round(((value - range.low) / span) * 100) };
}

function rangeLabel(position: RangePosition, range: ParameterRange | undefined): string {
  switch (position.kind) {
    case "inside":
      return `p${position.percentile} of ${range!.low}–${range!.high}`;
    case "outside":
      return `outside the declared range ${range!.low}–${range!.high}`;
    case "degenerate":
      return "range has no width";
    default:
      return "search range not published";
  }
}

export function ParametersView({ runId }: { runId: string }) {
  // One dependency for every chart in this view; see useChartTheme.
  const chart = useChartTheme();
  // Read per render, not once at module load: captured at import this was
  // always the light-theme value, so the heatmap cell borders stayed light in
  // Operations Dark.
  const viz = useMemo(() => vizTokensFor(chart.theme), [chart.theme]);

  const parameters = useQuery({ queryKey: ["parameters", runId], queryFn: () => api.parameters(runId) });
  const trialsQuery = useQuery({ queryKey: ["trials", runId], queryFn: () => api.trials(runId, `top_n=${TRIAL_QUERY_CAP}`) });
  const detail = useQuery({ queryKey: ["run", runId], queryFn: () => api.getRun(runId) });
  const strategies = useQuery({ queryKey: ["strategies"], queryFn: api.strategies });
  const audit = useQuery({ queryKey: ["audit", runId], queryFn: () => api.audit(runId), staleTime: 60_000 });

  const trials = artifactTable(trialsQuery);
  const selectedDocument = (parameters.data?.selected ?? {}) as Record<string, unknown>;
  const selected = (selectedDocument.params ?? {}) as Record<string, number>;
  const paramsByFold = (parameters.data?.params_by_fold ?? {}) as Record<string, unknown>;

  // The run's own strategy, not whichever one the registry lists first.
  const strategy = useMemo(
    () => strategies.data?.find((item) => item.strategy_id === detail.data?.strategy_id),
    [strategies.data, detail.data?.strategy_id],
  );
  const ranges = (strategy?.parameter_space ?? {}) as Record<string, ParameterRange>;
  const rows = trials.rows;

  const manifest = (audit.data?.manifest ?? {}) as Record<string, unknown>;
  const run: RunEvidence = {
    runId,
    asOf: typeof manifest.completed_at === "string" ? manifest.completed_at : null,
    digest: typeof manifest.dataset_content_hash === "string" ? manifest.dataset_content_hash : null,
    warnings: trials.population.truncated
      ? [
          `Charts draw ${trials.population.returned} of ${trials.population.total} trials in the artifact ` +
            `(server cap top_n=${TRIAL_QUERY_CAP} by objective).`,
        ]
      : undefined,
  };

  const paramKeys = Object.keys(selected);
  const numericKeys = useMemo(
    () => paramKeys.filter((key) => rows.some((row) => typeof rowParams(row)[key] === "number")),
    [paramKeys, rows],
  );
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");
  const [distributionParam, setDistributionParam] = useState("");

  useEffect(() => {
    if (!numericKeys.length) return;
    setDistributionParam((current) => (current && numericKeys.includes(current) ? current : numericKeys[0]));
    setPairA((current) => (current && numericKeys.includes(current) ? current : numericKeys[0]));
    setPairB((current) =>
      current && numericKeys.includes(current) ? current : (numericKeys[1] ?? numericKeys[0]),
    );
  }, [numericKeys]);

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
        xAxis: { type: "category", data: bins.map((bin) => Number(bin.center.toPrecision(5))), axisLabel: { hideOverlap: true }, name: distributionParam, nameLocation: "middle", nameGap: 26 },
        yAxis: { type: "value", minInterval: 1, name: "trials", nameLocation: "middle", nameGap: 40 },
        series: [{
          name: distributionParam,
          type: "bar",
          data: bins.map((bin) => bin.count),
          itemStyle: { color: chart.palette.accent, opacity: 0.7 },
        }],
      }, chart.theme);
  }, [distributionParam, rows, chart]);

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
        textStyle: { color: chart.palette.inkFaint, fontSize: 10 },
      },
      tooltip: { trigger: "item", formatter: (params: unknown) => { const data = (params as { data: [number, number, number, number] }).data; return `${pairA}=${xValues[data[0]]}<br/>${pairB}=${yValues[data[1]]}<br/>mean objective=${data[2].toFixed(4)}<br/>n=${data[3]}`; } },
      xAxis: { type: "category", data: xValues, name: pairA, nameLocation: "middle", nameGap: 26 },
      yAxis: { type: "category", data: yValues, name: pairB, nameLocation: "middle", nameGap: 40 },
      series: [
        {
          type: "heatmap",
          data: cells.map((cell) => [xValues.indexOf(cell.x), yValues.indexOf(cell.y), cell.objective, cell.count]),
          itemStyle: { borderColor: viz.cellBorder, borderWidth: 1 },
        },
      ],
    }, chart.theme);
  }, [rows, pairA, pairB, chart, viz]);

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
        nameTextStyle: { color: chart.palette.inkFaint, fontSize: 10 },
      })),
      parallel: { top: 30, left: 40, right: 40, bottom: 40 },
      series: [
        {
          type: "parallel",
          lineStyle: { color: chart.palette.accent, opacity: 0.25, width: 1 },
          data: values,
        },
      ],
    }, chart.theme);
  }, [rows, paramKeys, chart]);

  if (parameters.isPending || trials.state === "loading") {
    return <ResultsSkeleton message="Loading the parameter analysis…" />;
  }
  if (parameters.isError) {
    return (
      <StateView
        kind="failed"
        message={parameters.error instanceof Error ? parameters.error.message : undefined}
        onRetry={() => void parameters.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <FrozenSet
        params={selected}
        ranges={ranges}
        document={selectedDocument}
        rangesKnown={Boolean(strategy)}
        strategyId={detail.data?.strategy_id ?? null}
      />
      <SelectionClaims document={selectedDocument} paramsByFold={paramsByFold} />

      {trials.state !== "ready" ? (
        <div className="card p-4">
          <div className="label mb-2">Trial analysis</div>
          <StateView
            kind={artifactStateKind(trials.state)}
            message={artifactExplanation(trials, "wfo/trials.parquet")}
            onRetry={() => void trialsQuery.refetch()}
          />
        </div>
      ) : (
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
                units: `${distributionParam || "parameter"} (trials per bin)`,
                available: trials.population.total,
                plotted: distributionPlotted,
                reduction: `trials without a numeric ${distributionParam || "parameter"} dropped`,
              })}
            >
              <EChart option={coverageOption} height={340} />
            </ChartFigure>
            <ChartFigure
              figNumber={2}
              title="Objective contour — parameter sensitivity"
              note="Each cell is the mean objective of the trials that landed on that pair of values; an empty cell is a pair no trial visited, not an objective of zero."
              provenance={tableProvenance(run, {
                source: "wfo/trials.parquet",
                segment: "is",
                units: "mean objective",
                available: trials.population.total,
                plotted: contourPlotted,
                reduction: `trials missing ${pairA} or ${pairB} dropped`,
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
              units: "normalized parameter values",
              available: trials.population.total,
              plotted: Math.min(rows.length, PARALLEL_TOP_N),
              // A client-side top-N, named as one: the tail is not missing from
              // the artifact, it is simply not drawn.
              reduction: `client top-${PARALLEL_TOP_N} by objective`,
            })}
          >
            <EChart option={parallelOption} height={420} />
          </ChartFigure>
        </div>
      )}

      <StructuralContract strategy={strategy} strategyId={detail.data?.strategy_id ?? null} />
    </div>
  );
}

/** The frozen parameter set, with each value placed inside its search range. */
function FrozenSet({
  params,
  ranges,
  document,
  rangesKnown,
  strategyId,
}: {
  params: Record<string, number>;
  ranges: Record<string, ParameterRange>;
  document: Record<string, unknown>;
  rangesKnown: boolean;
  strategyId: string | null;
}) {
  const keys = Object.keys(params);
  const trialId = document.trial_id as number | null | undefined;
  const frozenAt = typeof document.frozen_at === "string" ? document.frozen_at : null;
  const hash = typeof document.params_hash === "string" ? document.params_hash : null;

  if (keys.length === 0) {
    return (
      <section className="card p-4">
        <div className="label mb-2">Frozen parameter set</div>
        <StateView kind="empty" message="selected_params.json published no parameter values for this run." />
      </section>
    );
  }

  return (
    <section className="card p-4" aria-labelledby="frozen-set">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 id="frozen-set" className="font-display text-[15px] text-ink">
          Frozen parameter set θ*
        </h3>
        <span className="mono text-[11px] text-ink-faint">
          {trialId != null ? `trial #${trialId}` : "no trial id"}
          {frozenAt ? ` · frozen ${fmtTimestamp(frozenAt)}` : ""}
          {hash ? ` · ${hash.slice(0, 12)}…` : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {keys.map((key) => {
          const value = params[key];
          const range = ranges[key];
          const position = rangePosition(value, range);
          return (
            <div key={key}>
              <div className="label">{key}</div>
              <div className="mono text-[18px] font-semibold leading-tight text-ink">{value}</div>
              <div className="text-[11px] leading-4 text-ink-faint">{rangeLabel(position, range)}</div>
            </div>
          );
        })}
      </div>
      {!rangesKnown ? (
        <p className="mt-3 text-[12px] leading-5 text-ink-faint">
          No registered strategy matches this run's{" "}
          <span className="mono">{strategyId ?? "strategy id"}</span>, so the search ranges these
          values were drawn from are not on record here. The values above are the run's own.
        </p>
      ) : null}
    </section>
  );
}

/**
 * What the engine claims about the frozen set.
 *
 * `oos_used_for_selection` is the one that changes how every OOS number on the
 * other tabs should be read, so it is stated as a sentence rather than left as
 * a boolean in a definition list — a reader who never expands a panel still has
 * to meet it.
 */
function SelectionClaims({
  document,
  paramsByFold,
}: {
  document: Record<string, unknown>;
  paramsByFold: Record<string, unknown>;
}) {
  const causality = typeof document.causality_claim === "string" ? document.causality_claim : null;
  const validation = typeof document.validation_claim === "string" ? document.validation_claim : null;
  const semantics = typeof document.params_semantics === "string" ? document.params_semantics : null;
  const oosUsed = document.oos_used_for_selection;
  const foldCount = Object.keys(paramsByFold).length;

  if (!causality && !validation && !semantics && oosUsed === undefined) return null;

  return (
    <section className="card p-4" aria-labelledby="selection-claims">
      <h3 id="selection-claims" className="font-display mb-3 text-[15px] text-ink">
        What this parameter set claims
      </h3>
      {oosUsed === true ? (
        <p className="claim-caution">
          The out-of-sample segment was used while selecting this parameter set
          (<span className="mono">oos_used_for_selection: true</span>). OOS figures on the other
          tabs are therefore not an untouched hold-out, and should be read as in-sample-adjacent.
        </p>
      ) : oosUsed === false ? (
        <p className="text-[13px] leading-6 text-ink-soft">
          The out-of-sample segment was not consulted during selection
          (<span className="mono">oos_used_for_selection: false</span>).
        </p>
      ) : null}
      <DefinitionList
        rows={[
          ["Causality", causality ? causality.replace(/_/g, " ") : "not published"],
          ["Validation", validation ? validation.replace(/_/g, " ") : "not published"],
          [
            "Scope",
            semantics === "single_global_parameter_set"
              ? "one global parameter set for the whole period"
              : (semantics?.replace(/_/g, " ") ?? "not published"),
          ],
          [
            "Per-fold sets",
            foldCount > 0
              ? `${foldCount} fold${foldCount === 1 ? "" : "s"} carry their own parameters`
              : "none — the run did not refit per fold",
          ],
        ]}
      />
      {foldCount > 0 ? (
        <Collapsible title={`Parameters by fold (${foldCount})`} defaultOpen={false}>
          <DefinitionList
            rows={Object.entries(paramsByFold).map(
              ([fold, value]) => [`fold ${fold}`, JSON.stringify(value)] as [string, string],
            )}
          />
        </Collapsible>
      ) : null}
    </section>
  );
}

function StructuralContract({
  strategy,
  strategyId,
}: {
  strategy: StrategyResponse | undefined;
  strategyId: string | null;
}) {
  if (!strategy) return null;
  const contract = strategy.structural_contract ?? {};
  return (
    <div className="card p-4">
      <Collapsible
        title={`Structural contract — ${strategy.display_name} v${strategy.version}`}
        defaultOpen={false}
      >
        <p className="mb-2 text-[12px] leading-5 text-ink-faint">
          The parts of <span className="mono">{strategyId}</span> that optimization may not change.
        </p>
        <DefinitionList
          rows={Object.entries(contract).map(([key, value]) => [key.replace(/_/g, " "), String(value)] as [string, string])}
        />
      </Collapsible>
    </div>
  );
}
