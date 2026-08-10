/** Execution: price + target transitions, position strip, equity/drawdown, transition table (§17).
 *  Protocol-aware (v0.1.1): advanced_walk_forward uses the single stitched
 *  OOS account; three-window offers IS/OOS/Holdout Live. */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { EChart } from "../../charts/EChart";
import { baseOption, palette } from "../../charts/theme";
import { ChartFigure } from "../../components/ChartFigure";
import { SegmentedControl, StateView } from "../../components/ui";
import { api, type SeriesPayload } from "../../lib/api";
import { entryPoints, exitPoints } from "../../lib/transitions";

const SEGMENTS = ["is", "oos", "holdout_live"] as const;
type SegmentKey = (typeof SEGMENTS)[number];

export function ExecutionView({ runId }: { runId: string }) {
  const detail = useQuery({ queryKey: ["run", runId], queryFn: () => api.getRun(runId) });
  const advanced = detail.data?.protocol === "advanced_walk_forward";
  const [segment, setSegment] = useState<SegmentKey | "stitched">(advanced ? "stitched" : "oos");
  const series = useQuery({
    queryKey: ["series", runId, segment],
    queryFn: () => api.series(runId, segment, 4000),
    staleTime: 60_000,
  });
  if (series.isLoading || detail.isLoading) return <StateView kind="loading" />;
  if (series.isError) return <StateView kind="failed" message={series.error.message} onRetry={() => series.refetch()} />;

  return (
    <div className="space-y-6">
      {advanced ? (
        <span className="chip">Stitched OOS account</span>
      ) : (
        <SegmentedControl
          value={segment as SegmentKey}
          onChange={setSegment}
          options={[
            { value: "is", label: "IS" },
            { value: "oos", label: "OOS" },
            { value: "holdout_live", label: "Holdout Live" },
          ]}
        />
      )}
      <PriceChart payload={series.data!} />
      <PositionStrip payload={series.data!} />
      <div className="card p-4">
        <div className="label mb-2">Cost timeline</div>
        <p className="text-[12px] leading-5 text-ink-faint">
          Fee/funding/margin series chưa được QuantBT expose (capability gap — xem ARCHITECTURE.md); cost
          timeline sẽ xuất hiện khi backend cung cấp.
        </p>
      </div>
      <TransitionTable payload={series.data!} />
    </div>
  );
}

function PriceChart({ payload }: { payload: SeriesPayload }) {
  const option = useMemo(() => {
    const target = payload.series.signal_target ?? [];
    const close = payload.series.close ?? [];
    const entries = entryPoints(target, close);
    const exits = exitPoints(target, close);
    return baseOption({
      grid: { left: 56, right: 20, top: 20, bottom: 48, containLabel: true },
      legend: { show: false },
      series: [
        {
          name: "close",
          type: "line",
          showSymbol: false,
          data: payload.series.close?.map((value, index) => [payload.timestamps[index], value]),
          lineStyle: { width: 1.25, color: "#5d7b93" },
          itemStyle: { color: "#5d7b93" },
        },
        {
          name: "Long entry",
          type: "scatter",
          symbol: "triangle",
          symbolSize: 14,
          itemStyle: { color: "var(--good)", borderColor: "#0f5c3a", borderWidth: 1 },
          data: entries.filter((entry) => entry.side === 1).map((entry) => [payload.timestamps[entry.index], entry.price]),
        },
        {
          name: "Short entry",
          type: "scatter",
          symbol: "triangle",
          symbolRotate: 180,
          symbolSize: 14,
          itemStyle: { color: "var(--bad)", borderColor: "#7c2626", borderWidth: 1 },
          data: entries.filter((entry) => entry.side === -1).map((entry) => [payload.timestamps[entry.index], entry.price]),
        },
        {
          name: "Long exit",
          type: "scatter",
          symbol: "path://M-4,-4 L4,4 M4,-4 L-4,4",
          symbolSize: 13,
          itemStyle: { color: "var(--good)", borderColor: "var(--good)", borderWidth: 1.5 },
          data: exits.filter((exit) => exit.side === 1).map((exit) => [payload.timestamps[exit.index], exit.price]),
        },
        {
          name: "Short exit",
          type: "scatter",
          symbol: "path://M-4,-4 L4,4 M4,-4 L-4,4",
          symbolSize: 13,
          itemStyle: { color: "var(--bad)", borderColor: "var(--bad)", borderWidth: 1.5 },
          data: exits.filter((exit) => exit.side === -1).map((exit) => [payload.timestamps[exit.index], exit.price]),
        },
      ],
    });
  }, [payload]);
  return (
    <ChartFigure
      figNumber={1}
      title="Close price + target transitions"
      note="▲▼ = entry · ✕ = exit. Markers là Target transition từ strategy signal (pos_weight), không phải audited fills."
      sourceId="series/*"
    >
      <EChart option={option} height={640} />
    </ChartFigure>
  );
}

function PositionStrip({ payload }: { payload: SeriesPayload }) {
  const option = useMemo(
    () =>
      baseOption({
        grid: { left: 56, right: 20, top: 10, bottom: 48, containLabel: true },
        legend: { show: false },
        tooltip: { trigger: "axis" },
        xAxis: { type: "time" },
        yAxis: { type: "value", min: -1.5, max: 1.5, interval: 1, axisLabel: { formatter: "{value}" } },
        series: [
          {
            name: "position",
            type: "line",
            step: "end",
            showSymbol: false,
            data: payload.series.accepted_position?.map((value, index) => [payload.timestamps[index], value]),
            lineStyle: { color: palette.accent, width: 1.75 },
            areaStyle: { color: "rgba(15,76,92,.08)" },
          },
        ],
      }),
    [payload],
  );
  return (
    <ChartFigure figNumber={2} title="Position regime strip" sourceId="series/*">
      <EChart option={option} height={150} />
    </ChartFigure>
  );
}

function TransitionTable({ payload }: { payload: SeriesPayload }) {
  const rows: Array<{ at: string; side: string; target: number; exit: number; price: number }> = [];
  const target = payload.series.signal_target ?? [];
  const exitType = payload.series.exit_type ?? [];
  const exitPrice = payload.series.exit_price ?? [];
  const close = payload.series.close ?? [];
  let prev = 0;
  for (let i = 0; i < target.length; i += 1) {
    const value = target[i] ?? 0;
    if (value !== prev) {
      rows.push({
        at: payload.timestamps[i],
        side: value > 0 ? "LONG" : value < 0 ? "SHORT" : "FLAT",
        target: value,
        exit: exitType[i] ?? 0,
        price: (exitType[i] ?? 0) > 0 ? exitPrice[i] ?? 0 : close[i] ?? 0,
      });
    }
    prev = value;
  }
  return (
    <div className="card overflow-x-auto p-4">
      <div className="label mb-2">Transition table — target only (không phải fills)</div>
      <table className="w-full min-w-[520px] text-[12px]">
        <thead>
          <tr>
            <th className="mono pb-2 text-left text-[11px] uppercase text-ink-faint">timestamp</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">target</th>
            <th className="mono pb-2 text-left text-[11px] uppercase text-ink-faint">side</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">exit_type</th>
            <th className="mono pb-2 text-right text-[11px] uppercase text-ink-faint">exit_price</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(-200).map((row) => (
            <tr key={row.at} className="border-t border-line-soft hover:bg-sunken">
              <td className="py-1 text-ink-faint">{row.at}</td>
              <td className="num">{row.target}</td>
              <td className={row.side === "LONG" ? "text-good" : row.side === "SHORT" ? "text-bad" : "text-ink-faint"}>
                {row.side}
              </td>
              <td className="num">{row.exit}</td>
              <td className="num">{row.price.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
