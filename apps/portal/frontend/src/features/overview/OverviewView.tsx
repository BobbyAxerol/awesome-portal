/** Overview: KPI hero, equity compare, underwater, metrics, verdict chain (§14).
 *  Protocol-aware: three-window uses 3 fresh-account segments + calendar
 *  presentation; advanced_walk_forward uses the single stitched OOS account
 *  (v0.1.1 bugfix — the 3-segment queries 404 for advanced runs). */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption } from "../../charts/theme";
import { useChartTheme } from "../../charts/useChartTheme";
import { ChartFigure } from "../../components/ChartFigure";
import { MetricTile, MetricTileRow } from "../../components/MetricTile";
import { ResultsSkeleton, SegmentedControl, StateView } from "../../components/ui";
import { api, type SeriesPayload } from "../../lib/api";
import { fmtCount, fmtPct, fmtRatio } from "../../lib/format";
import { seriesProvenance, type RunEvidence } from "../quantbt/provenance";
import { HEADLINE_METRICS, MATRIX_METRICS, metricDefinition } from "./metricDefinitions";

const SEGMENTS = ["is", "oos", "holdout_live"] as const;
type SegmentKey = (typeof SEGMENTS)[number];
const SEGMENT_LABELS: Record<string, string> = {
  is: "IS",
  oos: "OOS",
  holdout_live: "Holdout Live",
  stitched: "Stitched OOS",
};

export function OverviewView({ runId }: { runId: string }) {
  // One dependency for every chart in this view; see useChartTheme.
  const chart = useChartTheme();

  const detail = useQuery({ queryKey: ["run", runId], queryFn: () => api.getRun(runId) });
  const protocol = detail.data?.protocol ?? "three_window_decay";
  const advanced = protocol === "advanced_walk_forward";
  const summary = useQuery({ queryKey: ["summary", runId], queryFn: () => api.summary(runId) });
  // Provenance for every metric and chart on this screen comes from the run's
  // immutable manifest — the frontend does not synthesise an as-of.
  const audit = useQuery({ queryKey: ["audit", runId], queryFn: () => api.audit(runId), staleTime: 60_000 });
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
  const manifest = (audit.data?.manifest ?? {}) as Record<string, unknown>;
  const asOf = typeof manifest.completed_at === "string" ? manifest.completed_at : null;
  const datasetDigest =
    typeof manifest.dataset_content_hash === "string" ? manifest.dataset_content_hash : null;
  const summaryWarnings = summary.data?.metrics.warnings ?? [];

  // Chart envelope (v0.5 §12.2). The series endpoints publish
  // source_rows/returned_rows/downsample_stride now, so the row counts and the
  // reduction method are read rather than assumed — the cast-and-hope that
  // stood here while `source_rows` was unpublished is gone.
  const activeSeries = advanced ? stitchedQuery.data : presentation.data;
  const runEvidence: RunEvidence = {
    runId,
    asOf,
    digest: datasetDigest,
    warnings: summaryWarnings,
  };
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
        // Axis styling comes from the theme. It used to be re-declared here
        // with `formatter: "{yyyy}"` — which is why an eight-month run showed
        // four ticks all reading "2024" — and with `var(--ink-faint)`, which a
        // canvas renderer cannot resolve at all.
        xAxis: { type: "time", splitNumber: 5, axisLabel: { hideOverlap: true, margin: 10 } },
        series: [
          {
            name: "Stitched OOS",
            type: "line" as const,
            showSymbol: false,
            connectNulls: false,
            data,
            lineStyle: { width: 1.75, color: chart.roleColors.oos },
            itemStyle: { color: chart.roleColors.oos },
          },
        ],
      }, chart.theme);
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
        lineStyle: { width: 1.75, color: chart.roleColors[key] },
        itemStyle: { color: chart.roleColors[key] },
      };
    });
    return baseOption({
      grid: { left: 58, right: 24, top: 46, bottom: 54, containLabel: true },
      legend: { data: series.map((item) => item.name), top: 2, right: 12, left: "auto" },
      xAxis: { type: "time", splitNumber: 5, axisLabel: { hideOverlap: true, margin: 10 } },
      series,
    }, chart.theme);
  }, [advanced, capitalMode, presentation.data, selected, stitchedQuery.data, chart]);

  const underwaterOption = useMemo(() => {
    const active = segments.filter((segment) => segment.series);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 48, containLabel: true },
      legend: { show: false },
      xAxis: { type: "time", splitNumber: 5, axisLabel: { hideOverlap: true, margin: 10 } },
      // A drawdown axis without its unit reads as a bare index. The series is
      // already in percent (value * 100 below), so the suffix is a label, not a
      // conversion.
      yAxis: { axisLabel: { formatter: (value: number) => `${value}%` } },
      series: active.map((segment) => {
        const payload = segment.series!;
        const dd = payload.series.drawdown ?? [];
        const color = chart.roleColors[advanced ? "oos" : segment.key] ?? chart.roleColors.oos;
        return {
          name: SEGMENT_LABELS[segment.key] ?? segment.key,
          type: "line",
          showSymbol: false,
          data: dd.map((value, index) => [payload.timestamps[index], value == null ? null : value * 100]),
          lineStyle: { width: 1.25, color, opacity: 0.8 },
          itemStyle: { color },
          // Drawdown is an area by convention — it reads as depth below the
          // previous peak, not as a wiggling line. At 0.07 the fill was
          // invisible, so the chart was drawing the convention without showing it.
          areaStyle: { color, opacity: 0.18 },
          // The deepest point is the one the max-drawdown metric refers to; the
          // chart and the metric strip should be pointing at the same place.
          markPoint: {
            symbol: "circle",
            symbolSize: 7,
            itemStyle: { color, borderColor: chart.palette.paperRaised, borderWidth: 1.5 },
            label: {
              show: true,
              position: "top",
              distance: 8,
              color: chart.palette.ink,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              formatter: (params: { value?: unknown }) =>
                typeof params.value === "number" ? `${fmtRatio(params.value)}%` : "",
            },
            data: [{ type: "min", name: "deepest trough", valueIndex: 1 }],
          },
        };
      }),
    }, chart.theme);
  }, [segments, advanced, chart]);

  if (summary.isLoading || detail.isLoading || !loaded)
    return <ResultsSkeleton message="Loading run results…" />;
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

      <MetricTileRow>
        {HEADLINE_METRICS.map((key) => (
          <MetricTile
            key={key}
            metricKey={key}
            value={heroMetrics[key] ?? null}
            emphasis={key === "total_return_pct"}
            evidence={{
              segment: SEGMENT_LABELS[heroKey] ?? heroKey,
              source: `metrics/summary.json#${heroKey}`,
              asOf,
              digest: datasetDigest,
            }}
          />
        ))}
      </MetricTileRow>

      <ChartFigure
        figNumber={1}
        title={`Equity — ${advanced ? "stitched OOS account" : capitalMode === "capital" ? "fresh account capital" : "rebased to 100"}`}
        provenance={seriesProvenance(activeSeries, runEvidence, {
          source: advanced
            ? "series/stitched.parquet"
            : `presentation/${capitalMode === "capital" ? "calendar" : "rebased"}`,
          segment: advanced ? "stitched" : selected === "compare" ? "is+oos+holdout" : selected,
          units: capitalMode === "capital" ? "USD" : "index (100 = baseline)",
        })}
      >
        <EChart option={equityOption} height={560} />
      </ChartFigure>

      <ChartFigure
        figNumber={2}
        title="Underwater — drawdown derived from equity"
        note="Drawdown is a restatement of the equity series above, not a separate metric the engine computes."
        provenance={seriesProvenance(activeSeries, runEvidence, {
          source: advanced ? "series/stitched.parquet" : "presentation/calendar",
          segment: advanced ? "stitched" : "is+oos+holdout",
          units: "% from prior peak",
        })}
      >
        <EChart option={underwaterOption} height={220} />
      </ChartFigure>

      <MetricsCard metrics={metrics} advanced={advanced} asOf={asOf} digest={datasetDigest} />
    </div>
  );
}

/**
 * Comparison matrix.
 *
 * A metric the engine did not compute for a segment renders as an explicit
 * absent marker with its reason, not as a dash that reads like a value
 * (FRONTEND_HANDOFF §4). Every column states the segment it evidences and the
 * table footer carries the shared as-of and digest.
 */
function MetricsCard({
  metrics,
  advanced,
  asOf,
  digest,
}: {
  metrics: Record<string, unknown>;
  advanced: boolean;
  asOf: string | null;
  digest: string | null;
}) {
  const segments = metrics as Record<string, Record<string, number | null>>;
  const columns = advanced ? (["stitched"] as const) : (["is", "oos", "holdout_live"] as const);

  const format = (key: string, value: number | null) => {
    if (value === null) return null;
    const definition = metricDefinition(key);
    if (definition.unit === "count") return fmtCount(value);
    if (definition.unit === "percent") return fmtPct(value);
    return fmtRatio(value);
  };

  return (
    <div className="card p-4">
      <div className="label mb-3">
        {advanced ? "Metrics — stitched OOS account" : "Reconciliation matrix — IS / OOS / Holdout Live"}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              {columns.map((column) => (
                <th key={column} className="text-right">
                  {SEGMENT_LABELS[column] ?? column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_METRICS.map((key) => {
              const definition = metricDefinition(key);
              return (
                <tr key={key}>
                  <th scope="row" className="metric-row-label">
                    <span title={definition.definition}>{definition.label}</span>
                    {/* The unit belongs to the metric, so it rides with the row
                      * label in its own quiet column rather than being repeated
                      * as a chip inside eight sentences. */}
                    <span className="metric-row-unit">{definition.unit}</span>
                  </th>
                  {columns.map((column) => {
                    const text = format(key, segments[column]?.[key] ?? null);
                    return (
                      <td key={column} className="num">
                        {text ?? (
                          <span className="metric-absent-inline mono" title={`The engine did not compute ${definition.label} for the ${column} segment.`}>
                            not computed
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="chart-provenance">
        <dl className="chart-provenance-grid">
          <div className="chart-provenance-field" data-wide="true">
            <dt>source</dt>
            <dd className="mono">metrics/summary.json</dd>
          </div>
          <div className="chart-provenance-field">
            <dt>as-of</dt>
            <dd className="mono">{asOf ?? "not published"}</dd>
          </div>
          {digest ? (
            <div className="chart-provenance-field" data-wide="true">
              <dt>dataset</dt>
              <dd className="mono">{digest.slice(0, 19)}…</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
