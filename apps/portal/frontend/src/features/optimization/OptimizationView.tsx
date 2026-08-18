/**
 * Optimization — how the parameter set was chosen (§15).
 *
 * Reading order follows what the analyst has to decide, not what the artifacts
 * happen to contain: the selected trial first, then how wide the search that
 * produced it was, then when the engine did the work, then the evidence charts,
 * then the raw tables. The previous order opened on a static row of stage chips
 * that said the same six words for every run.
 *
 * Every artifact is read through `artifactTable`, so a run that never wrote
 * `wfo/candidates.parquet` explains itself instead of turning the whole screen
 * into a failure — and never contributes a `0` to a count.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption } from "../../charts/theme";
import { useChartTheme } from "../../charts/useChartTheme";
import type { EChartsOption } from "echarts";
import { ChartFigure } from "../../components/ChartFigure";
import { Collapsible, DefinitionList, ResultsSkeleton, Skeleton, StateView } from "../../components/ui";
import { FoldGantt } from "../../components/FoldGantt";
import { api, rowParams } from "../../lib/api";
import { fmtDecay, fmtRatio } from "../../lib/format";
import { artifactExplanation, artifactStateKind, artifactTable, type ArtifactTable } from "../quantbt/artifacts";
import { tableProvenance, type RowPopulation, type RunEvidence } from "../quantbt/provenance";

/** Server-side cap on the trials query; disclosed on every trial chart. */
const TRIAL_QUERY_CAP = 5000;

export function OptimizationView({ runId }: { runId: string }) {
  // One dependency for every chart in this view; see useChartTheme.
  const chart = useChartTheme();

  const trialsQuery = useQuery({ queryKey: ["trials", runId], queryFn: () => api.trials(runId, `top_n=${TRIAL_QUERY_CAP}`) });
  const foldPlan = useQuery({ queryKey: ["fold-plan", runId], queryFn: () => api.foldPlan(runId), retry: 1 });
  const detail = useQuery({ queryKey: ["run", runId], queryFn: () => api.getRun(runId) });
  const candidatesQuery = useQuery({
    queryKey: ["candidates", runId],
    queryFn: () => api.candidates(runId),
    // An absent artifact is an answer, not a flake: retrying a 404 four times
    // only delays the explanation the screen is about to render.
    retry: (failureCount, error) =>
      failureCount < 2 && !(error as { status?: number })?.status,
  });
  const trace = useQuery({ queryKey: ["trace", runId], queryFn: () => api.trace(runId) });
  const foldsQuery = useQuery({ queryKey: ["folds", runId], queryFn: () => api.folds(runId) });
  const audit = useQuery({ queryKey: ["audit", runId], queryFn: () => api.audit(runId), staleTime: 60_000 });
  const [selectedTrial, setSelectedTrial] = useState<number | null>(null);

  const trials = artifactTable(trialsQuery);
  const candidates = artifactTable(candidatesQuery);
  const folds = artifactTable(foldsQuery);

  const manifest = (audit.data?.manifest ?? {}) as Record<string, unknown>;
  const run: RunEvidence = {
    runId,
    asOf: typeof manifest.completed_at === "string" ? manifest.completed_at : null,
    digest: typeof manifest.dataset_content_hash === "string" ? manifest.dataset_content_hash : null,
    // Truncation is DECLARED, not inferred. Comparing `rows.length >= cap`
    // cannot distinguish a truncated artifact from one holding exactly `cap`.
    warnings: trials.population.truncated
      ? [
          `Charts draw ${trials.population.returned} of ${trials.population.total} trials in the artifact ` +
            `(server cap top_n=${TRIAL_QUERY_CAP} by objective).`,
        ]
      : undefined,
  };

  const rows = useMemo(() => {
    const unique = new Map<string, Record<string, unknown>>();
    for (const row of trials.rows) {
      const study = row.study_id ?? row.schedule_fold_id ?? "global";
      const key = `${String(study)}:${String(row.trial_id)}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    return [...unique.values()];
  }, [trials.rows]);
  const candidateRows = candidates.rows;

  const tracedTrialId = (trace.data?.selected_trial_id as number | null | undefined) ?? null;
  const selectedId =
    selectedTrial ??
    tracedTrialId ??
    ((candidateRows[0]?.trial_id as number | null | undefined) ??
      (candidateRows[0]?.source_trial_id as number | null | undefined) ??
      null);

  const trialScatter = useMemo(() => {
    const data: Array<[number, number, number, number, number]> = rows
      .filter((row) => typeof row.objective === "number")
      .map((row) => [row.trial_id as number, row.objective as number, row.mean_is_sharpe as number, row.mean_oos_sharpe as number, row.mean_decay as number]);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 40, containLabel: true },
      legend: { show: false },
      dataZoom: [],
      tooltip: { trigger: "item", formatter: (p: { data: number[] }) => `trial #${p.data[0]}<br/>objective ${fmtRatio(p.data[1])}<br/>IS ${fmtRatio(p.data[2])} · OOS ${fmtRatio(p.data[3])}<br/>decay ${fmtDecay(p.data[4])}` },
      xAxis: { type: "value", name: "trial id", nameLocation: "middle", nameGap: 26 },
      yAxis: { type: "value", name: "objective", nameLocation: "middle", nameGap: 40 },
      series: [
        {
          type: "scatter",
          symbolSize: (value: number[]) => (value[0] === selectedId ? 12 : 7),
          data,
          itemStyle: {
            color: (params: { data: number[] }) =>
              params.data[0] === selectedId ? chart.palette.ink : chart.palette.accent,
            opacity: (params: { data: number[] }) => (params.data[0] === selectedId ? 1 : 0.6),
          },
        },
      ],
    } as unknown as EChartsOption, chart.theme);
  }, [rows, selectedId, chart]);

  /** Rows each chart actually draws — the numerator of its provenance line. */
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
      xAxis: { type: "value", name: "IS Sharpe", nameLocation: "middle", nameGap: 26 },
      yAxis: { type: "value", name: "OOS Sharpe", nameLocation: "middle", nameGap: 40 },
      series: [
        {
          type: "scatter",
          symbolSize: (value: number[]) => (value[2] === selectedId ? 12 : 8),
          data,
          itemStyle: { color: (params: unknown) => (params as { data: number[] }).data[2] === selectedId ? chart.palette.ink : chart.palette.accent, opacity: 0.75 },
        },
      ],
    }, chart.theme);
  }, [candidateRows, selectedId, chart]);

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
        yAxis: { type: "value", name: "decay", nameLocation: "middle", nameGap: 40 },
        series: [
          {
            type: "bar",
            data: decayData.map((row) => row.decay),
            itemStyle: {
              color: (params: { dataIndex: number }) =>
                decayData[params.dataIndex].id === selectedId ? chart.palette.ink : chart.palette.accent,
              opacity: (params: { dataIndex: number }) =>
                decayData[params.dataIndex].id === selectedId ? 1 : 0.75,
            },
            barWidth: 14,
          },
        ],
      } as EChartsOption, chart.theme),
    [decayData, selectedId, chart],
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
      xAxis: { type: "value", name: "trials loaded", nameLocation: "middle", nameGap: 26 },
      yAxis: { type: "value", name: "best objective", nameLocation: "middle", nameGap: 40 },
      series: [{ type: "line", showSymbol: false, data, lineStyle: { color: chart.palette.accent, width: 1.75 } }],
    }, chart.theme);
  }, [rows, chart]);

  if (trials.state === "loading") return <ResultsSkeleton message="Loading the trial ledger…" />;

  // Trials are the spine of this screen: every chart and both tables read from
  // them. Candidates are not — an absent candidate artifact is explained in
  // place, below, rather than replacing the trials the run really does have.
  if (trials.state !== "ready" && trials.state !== "empty") {
    return (
      <StateView
        kind={artifactStateKind(trials.state)}
        message={artifactExplanation(trials, "wfo/trials.parquet")}
        onRetry={() => void trialsQuery.refetch()}
      />
    );
  }

  const showFoldGantt =
    foldPlan.data?.protocol === "advanced_walk_forward" &&
    (foldPlan.data.folds.length ?? 0) > 0 &&
    detail.data?.protocol === "advanced_walk_forward";

  return (
    <div className="space-y-6">
      <SelectionOutcome
        trace={trace.data}
        selectedTrialId={tracedTrialId}
        loading={trace.isPending}
      />
      <SearchFunnel trials={trials} rows={rows} candidates={candidates} selectedTrialId={tracedTrialId} />
      <StageTimeline events={detail.data?.events ?? []} />

      {showFoldGantt ? <FoldGantt plan={foldPlan.data!} studyStarts={0} bestByStudy={[]} running={false} /> : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartFigure
          figNumber={1}
          title="Trials — IS objective by trial id"
          provenance={tableProvenance(run, {
            source: "wfo/trials.parquet",
            segment: "is",
            units: "objective",
            // Denominator is the artifact, not the page: a chart that says
            // "200/200" while the artifact holds 40,000 is not honest.
            available: trials.population.total,
            plotted: trialsPlotted,
            reduction: trials.population.truncated
              ? `server top_n=${TRIAL_QUERY_CAP} by objective, then trials without an objective dropped`
              : "trials without an objective dropped",
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
            available: candidates.population.total,
            plotted: candidates.state === "ready" ? candidatesPlotted : null,
            reduction: candidates.population.truncated
              ? "server top_n, then candidates missing IS or OOS Sharpe dropped"
              : "candidates missing IS or OOS Sharpe dropped",
          })}
        >
          <ArtifactPanel table={candidates} artifact="wfo/candidates.parquet" height={360}>
            <EChart option={candidateScatter} height={360} />
          </ArtifactPanel>
        </ChartFigure>
        <ChartFigure
          figNumber={3}
          title="Decay by candidate"
          provenance={tableProvenance(run, {
            source: "wfo/candidates.parquet",
            segment: "is→oos",
            units: "decay",
            available: candidates.population.total,
            plotted: candidates.state === "ready" ? decayData.length : null,
            reduction: candidates.population.truncated
              ? "server top_n, then candidates without mean_decay dropped"
              : "candidates without mean_decay dropped",
          })}
        >
          <ArtifactPanel table={candidates} artifact="wfo/candidates.parquet" height={320}>
            <EChart option={decayOption} height={320} />
          </ArtifactPanel>
        </ChartFigure>
        <ChartFigure
          figNumber={4}
          title="Best-so-far convergence"
          note="The best-so-far line follows the order the trials were loaded in, not the study's wall-clock order."
          provenance={tableProvenance(run, {
            source: "wfo/trials.parquet",
            segment: "is",
            units: "objective",
            available: trials.population.total,
            plotted: rows.length,
            reduction: trials.population.truncated
              ? `server top_n=${TRIAL_QUERY_CAP} by objective`
              : undefined,
          })}
        >
          <EChart option={convergenceOption} height={320} />
        </ChartFigure>
      </div>

      <TrialTable rows={rows} population={trials.population} selectedId={selectedId} onSelect={setSelectedTrial} />
      <FoldTable table={folds} />
      <SelectionTrace trace={trace.data} />
    </div>
  );
}

/**
 * Wraps a figure body that depends on an artifact which may not exist.
 *
 * The frame, title and provenance line still render, so the reader sees which
 * evidence was expected and why it is not on screen — an empty canvas with a
 * confident caption is worse than a stated absence.
 */
function ArtifactPanel({
  table,
  artifact,
  height,
  children,
}: {
  table: ArtifactTable;
  artifact: string;
  height: number;
  children: React.ReactNode;
}) {
  if (table.state === "ready") return <>{children}</>;
  if (table.state === "loading") {
    return <Skeleton variant="chart" height={height} />;
  }
  return (
    <div style={{ minHeight: height }} className="flex items-center justify-center">
      <StateView kind={artifactStateKind(table.state)} message={artifactExplanation(table, artifact)} />
    </div>
  );
}

/**
 * What the run decided.
 *
 * This is the answer the tab exists to give, so it leads. `selection_trace.json`
 * publishes a `fields` block whose members are frequently null — those are
 * printed as "not published" rather than dropped, because a reader auditing a
 * selection needs to know the engine did not record the number, not be left to
 * assume the field was never part of the contract.
 */
function SelectionOutcome({
  trace,
  selectedTrialId,
  loading,
}: {
  trace: Record<string, unknown> | undefined;
  selectedTrialId: number | null;
  loading: boolean;
}) {
  if (loading) return <Skeleton variant="chart" height={104} />;

  const fields = (trace?.fields ?? {}) as Record<string, number | boolean | null>;
  const source = typeof trace?.source === "string" ? trace.source : null;
  const semantics = typeof trace?.params_semantics === "string" ? trace.params_semantics : null;

  const readings: Array<{ label: string; value: number | null | undefined; format: (v: number) => string }> = [
    { label: "Objective", value: fields.is_objective as number | null, format: (v) => fmtRatio(v, 4) },
    { label: "OOS Sharpe", value: fields.oos_sharpe_raw as number | null, format: (v) => fmtRatio(v) },
    { label: "Decay", value: fields.decay as number | null, format: fmtDecay },
  ];

  const published = readings.filter((reading) => typeof reading.value === "number");

  const header = (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="selection-outcome" className="font-display text-[15px] text-ink">
        Selected parameter set
      </h3>
      {source ? <span className="mono text-[11px] text-ink-faint">{source}</span> : null}
    </div>
  );

  // A protocol that records neither a trial id nor a single field would
  // otherwise open the screen with four large "not published" slots — an
  // absence rendered at the weight of a result. One sentence says the same
  // thing and leaves the emphasis to the evidence further down.
  if (selectedTrialId == null && published.length === 0) {
    return (
      <section className="card p-4" aria-labelledby="selection-outcome">
        {header}
        <p className="text-[13px] leading-6 text-ink-soft">
          This run's selection trace records no trial id and no selection figures — the protocol
          evaluated one global parameter set rather than choosing between trials.
          {semantics ? (
            <>
              {" "}
              Parameter semantics: <span className="mono">{semantics}</span>.
            </>
          ) : null}
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4" aria-labelledby="selection-outcome">
      {header}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <div className="label">Trial</div>
          <div className="mono text-[26px] font-semibold leading-none text-ink">
            {selectedTrialId != null ? `#${selectedTrialId}` : "not recorded"}
          </div>
        </div>
        {readings.map((reading) => (
          <div key={reading.label}>
            <div className="label">{reading.label}</div>
            <div className="mono text-[18px] font-semibold leading-none text-ink">
              {typeof reading.value === "number" ? reading.format(reading.value) : "not published"}
            </div>
          </div>
        ))}
      </div>
      {semantics ? (
        <p className="mt-3 text-[12px] leading-5 text-ink-faint">
          Parameter semantics: <span className="mono">{semantics}</span>
        </p>
      ) : null}
      {selectedTrialId == null ? (
        <p className="mt-3 text-[12px] leading-5 text-ink-faint">
          This run's selection trace carries no trial id — the protocol evaluated one global
          parameter set rather than choosing between trials.
        </p>
      ) : null}
    </section>
  );
}

/**
 * How wide the search was.
 *
 * Each step reads from a different artifact, and any of them can be legitimately
 * absent, so each renders its own value or an em dash — never a zero standing in
 * for a number nobody produced.
 */
function SearchFunnel({
  trials,
  rows,
  candidates,
  selectedTrialId,
}: {
  trials: ArtifactTable;
  rows: Record<string, unknown>[];
  candidates: ArtifactTable;
  selectedTrialId: number | null;
}) {
  const steps: Array<{ label: string; value: number | null; hint?: string }> = [
    { label: "sampled", value: trials.population.total },
    {
      label: "valid",
      value: trials.state === "ready" ? rows.filter((row) => row.pruned !== true).length : null,
      hint: trials.population.truncated ? "of the trials loaded" : undefined,
    },
    {
      label: "candidates",
      value: candidates.state === "ready" ? candidates.population.total : null,
      hint: candidates.state === "absent" ? "no candidate stage" : undefined,
    },
    { label: "selected", value: selectedTrialId != null ? 1 : null },
  ];
  return (
    <section className="card flex flex-wrap items-start gap-x-3 gap-y-4 p-4" aria-label="Search funnel">
      {steps.map((step, index) => (
        <span key={step.label} className="flex items-start gap-3">
          <span className="flex flex-col">
            <span className="label">{step.label}</span>
            <span className="mono text-[18px] font-semibold leading-tight text-ink">
              {step.value ?? "—"}
            </span>
            {step.hint ? <span className="text-[11px] leading-4 text-ink-faint">{step.hint}</span> : null}
          </span>
          {index < steps.length - 1 ? (
            <span className="mono mt-4 text-ink-faint" aria-hidden="true">
              →
            </span>
          ) : null}
        </span>
      ))}
    </section>
  );
}

/**
 * When the engine did the work.
 *
 * This replaces a fixed row of six stage names that read identically for every
 * run and carried no information. The states and their timestamps come from
 * `status.json`, so the strip now shows the stages this run actually entered and
 * how long each one held.
 */
function StageTimeline({ events }: { events: Array<{ state: string; at: number }> }) {
  if (events.length === 0) return null;
  const spans = events.map((event, index) => {
    const next = events[index + 1];
    return {
      state: event.state,
      seconds: next ? Math.max(0, next.at - event.at) : null,
    };
  });
  const longest = Math.max(1, ...spans.map((span) => span.seconds ?? 0));
  return (
    <section className="card p-4" aria-label="Run stages">
      <div className="label mb-3">Stages</div>
      <ol className="stage-strip">
        {spans.map((span, index) => (
          <li key={`${span.state}-${index}`} className="stage-strip-item">
            <span className="mono text-[11px] text-ink-soft">{span.state.toLowerCase().replace(/_/g, " ")}</span>
            <span
              className="stage-strip-bar"
              style={{ width: `${Math.max(4, ((span.seconds ?? 0) / longest) * 100)}%` }}
              aria-hidden="true"
            />
            <span className="mono text-[10px] text-ink-faint">
              {span.seconds == null ? "final" : `${span.seconds.toFixed(1)}s`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrialTable({
  rows,
  population,
  selectedId,
  onSelect,
}: {
  rows: Record<string, unknown>[];
  population: RowPopulation;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const shown = rows.slice(0, 200);
  return (
    <div className="card overflow-x-auto p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="label">Trial explorer</span>
        {/* A table is a figure too: saying which rows of the artifact are on
         * screen is the same §12.2 obligation the charts carry. */}
        <span className="mono text-[11px] text-ink-faint">
          {shown.length} of {population.total ?? "—"} trials
          {population.truncated ? " · server top_n" : ""}
        </span>
      </div>
      <table className="w-full min-w-[720px] text-[12px]">
        <thead>
          <tr>
            <th className="pb-2 text-left">trial</th>
            <th className="pb-2 text-right">objective</th>
            <th className="pb-2 text-right">IS Sharpe</th>
            <th className="pb-2 text-right">OOS Sharpe</th>
            <th className="pb-2 text-right">decay</th>
            <th className="pb-2 text-left">params</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => {
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
                <td className="mono max-w-[280px] truncate text-[11px] text-ink-faint">
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

function FoldTable({ table }: { table: ArtifactTable }) {
  if (table.state === "loading") return null;
  if (table.state !== "ready") {
    // A run without folds is normal; saying so costs one line and prevents the
    // reader wondering whether the table failed to load.
    return (
      <div className="card p-4">
        <div className="label mb-2">Fold map</div>
        <StateView kind={artifactStateKind(table.state)} message={artifactExplanation(table, "wfo/folds.parquet")} />
      </div>
    );
  }
  return (
    <div className="card overflow-x-auto p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="label">Fold map</span>
        <span className="mono text-[11px] text-ink-faint">
          {table.population.returned} of {table.population.total} folds
          {table.population.truncated ? " · server top_n" : ""}
        </span>
      </div>
      <table className="w-full min-w-[760px] text-[12px]">
        <thead><tr>{["fold", "train start", "train end", "test start", "test end", "train bars", "test bars"].map((label) => <th key={label} className="pb-2 text-left">{label}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, index) => <tr key={`${String(row.fold_id)}-${index}`} className="border-t border-line-soft">
          <td className="num w-16 py-1.5 pr-4">{String(row.fold_id ?? index)}</td>
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

/**
 * The full selection trace.
 *
 * `capabilities` used to print as the strings "true"/"false" in a definition
 * list, which tells a reader nothing about what the engine can show them. It is
 * now a sentence per capability, and the null members of `fields` are named as
 * unpublished rather than silently skipped.
 */
function SelectionTrace({ trace }: { trace: Record<string, unknown> | undefined }) {
  if (!trace) return null;
  const capabilities = (trace.capabilities ?? {}) as Record<string, boolean>;
  const fields = (trace.fields ?? {}) as Record<string, number | boolean | null>;
  return (
    <div className="card p-4">
      <Collapsible title="Selection trace — full record" defaultOpen={false}>
        <DefinitionList
          rows={[
            ["Artifact", String(trace.artifact_schema_version ? `selection_trace.json v${trace.artifact_schema_version}` : "selection_trace.json")],
            ["Source", String(trace.source ?? "not published")],
            ...Object.entries(fields).map(
              ([key, value]) =>
                [
                  key.replace(/_/g, " "),
                  value === null || value === undefined
                    ? "not published"
                    : typeof value === "number"
                      ? fmtRatio(value, 4)
                      : String(value),
                ] as [string, string],
            ),
          ]}
        />
        {Object.keys(capabilities).length ? (
          <ul className="mt-3 space-y-1 text-[12px] leading-5 text-ink-faint">
            {Object.entries(capabilities).map(([key, enabled]) => (
              <li key={key}>
                {enabled ? "✓" : "○"} {key.replace(/_/g, " ")}
                {enabled ? " is available for this run" : " is not recorded by this run's engine"}
              </li>
            ))}
          </ul>
        ) : null}
      </Collapsible>
    </div>
  );
}

function shortDate(value: unknown): string {
  if (value == null) return "—";
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? String(value);
}
