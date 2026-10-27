/**
 * Alpha 360 figures that come from the Manager DATASET (`getManagerDataset({surface: "ALPHA", id})`, execution-manager-dataset.v1),
 * through the ExecutionApi port: the same code serves the fixture lane and the real Edge.
 *
 * - `Return` (KPI tile): `return_30d_pct` of each dataset row (an alpha version in one portfolio, in the Book the reader chose). A
 *   tile never shows a number the dataset did not publish: no key, no row or a failed read is `Not published (FE-006)` with the
 *   reason behind the "?".
 * - `Windowed figures` (Performance tab): Allocation, Net PnL, Equity (30D end) as ONE CELL PER ECONOMIC PARTITION (the fleet's
 *   `PartitionFigures`), and Return. Nothing is summed over rows, partitions or currencies.
 * - The series port (`getManagerSeries`) serves FUND and PORTFOLIO subjects only, so there is no per-alpha series here; the chart
 *   stays the book's equity read and the missing per-alpha NAV/Net PnL/Return series is named in the panel.
 */
import type { ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { NaWhy, SectionPanel } from "../../blocks";
import { showDecimal } from "../../charts/decimal";
import type { ManagerDataset, ManagerRow } from "../../readers/managerDataset";
import type { ManagerMetricRead } from "../../readers/managerMetric";
import type { ExecEnv } from "../../urlState";
import { PartitionFigures } from "../fleet/PartitionFigures";
import { MetricValue, metricTitle } from "../manager/MetricValue";
import { useManagerDataset, type DatasetReadState } from "../manager/useManagerDataset";
import { Np, WhyMark } from "./np";

export type { DatasetReadState };

/** The ALPHA surface for one alpha in one Book. Not asked until the alpha is known to be present. */
export function useAlphaDataset(api: ExecutionApi, enabled: boolean, alphaId: string, env: ExecEnv, workspaceId: string | null): DatasetReadState {
  return useManagerDataset(api, enabled, { surface: "ALPHA", id: alphaId, environment: env, ...(workspaceId ? { workspaceId } : {}) });
}

/** A percentage the dataset publishes (`unit` PERCENT) prints as the exact string with `%`; any other unit prints its own word. */
export function PercentValue({ metric, signed = true }: { metric: ManagerMetricRead | undefined | null; signed?: boolean }): ReactNode {
  if (metric === undefined || metric === null || metric.kind === "absent") return <MetricValue metric={metric} />;
  if (metric.unit !== "PERCENT") {
    return <span className="exec-mgr-num" title={`${metric.exact} · ${metricTitle(metric)}`} data-zero={metric.zero ? "true" : undefined}>{`${metric.exact} ${metric.unit}`}</span>;
  }
  return <span className="exec-mgr-num" title={`${metric.exact} · ${metricTitle(metric)}`} data-zero={metric.zero ? "true" : undefined}>{showDecimal(metric.exact, { unit: "pct", signed })}</span>;
}

const RETURN_KEY = "return_30d_pct";
/** A portfolio is printed by the name the body states for its id; an id with no stated name prints as the id. */
const rowLabel = (row: ManagerRow, names: ReadonlyMap<string, string>): string => names.get(row.portfolioId) ?? row.portfolioId;

const why = (reason: string): ReactNode => (
  <span><Np id="FE-006" /><WhyMark name="Return, reason" reason={reason} /></span>
);

/** The Return KPI: one figure per dataset row, labelled by portfolio when there is more than one. */
export function ReturnFig({ read, names }: { read: DatasetReadState; names: ReadonlyMap<string, string> }): ReactNode {
  if (read.phase === "idle" || read.phase === "loading") return <span className="exec-alp2-dim">Loading</span>;
  if (read.phase === "error") return why(read.reason);
  const dataset: ManagerDataset = read.value;
  if (!dataset.queryOptions.metricKeys.includes(RETURN_KEY)) return why("The Manager dataset does not carry return_30d_pct in its published metric set.");
  if (dataset.items.length === 0) return why("The Manager dataset has no row for this alpha in this Book.");
  const several = dataset.items.length > 1;
  return (
    <>
      {dataset.items.map((row) => (
        <span key={row.rowKey} className="exec-alp2-fig">
          {several ? <span className="exec-alp2-dim">{rowLabel(row, names)} </span> : null}
          <PercentValue metric={row.metrics.return_30d_pct} />
        </span>
      ))}
    </>
  );
}

/** The Performance tab panel: the dataset rows with their windowed figures. */
export function WindowedFigures({ read, names }: { read: DatasetReadState; names: ReadonlyMap<string, string> }) {
  return (
    <SectionPanel title="Windowed figures" aside="Manager dataset, one cell per partition. Net PnL and return exclude unrealized; Equity includes it">
      <WindowedBody read={read} names={names} />
    </SectionPanel>
  );
}

function WindowedBody({ read, names }: { read: DatasetReadState; names: ReadonlyMap<string, string> }) {
  if (read.phase === "idle" || read.phase === "loading") return <p className="exec-alp2-line exec-alp2-dim">Loading</p>;
  if (read.phase === "error") return <p className="exec-alp2-line"><NaWhy reason={read.reason} /></p>;
  const dataset = read.value;
  const keys: readonly string[] = dataset.queryOptions.metricKeys;
  if (dataset.items.length === 0) return <p className="exec-alp2-line"><NaWhy reason="The Manager dataset has no row for this alpha in this Book." /></p>;
  const columns: CardsColumn<ManagerRow>[] = [
    { key: "portfolio", label: "Portfolio", render: (row) => rowLabel(row, names) },
    { key: "allocation", label: "Allocation", numeric: true, render: (row) => <PartitionFigures partitions={row.economicPartitions} metricKey="allocation" metricKeys={keys} gap={{ fe: "BQ-FLEET-ALLOC", what: "Allocation" }} /> },
    { key: "pnl", label: "Net PnL, realized", numeric: true, render: (row) => <PartitionFigures partitions={row.economicPartitions} metricKey="net_pnl" metricKeys={keys} gap={{ fe: "FE-025", what: "Net PnL" }} signed /> },
    { key: "equity", label: "Equity, 30D end", numeric: true, render: (row) => <PartitionFigures partitions={row.economicPartitions} metricKey="equity_30d_end_value" metricKeys={keys} gap={{ fe: "FE-013", what: "Equity" }} /> },
    { key: "return", label: "Return, 30D", numeric: true, render: (row) => (keys.includes(RETURN_KEY) ? <PercentValue metric={row.metrics.return_30d_pct} /> : <Np id="FE-006" />) },
  ];
  return <CardsTable label="Windowed figures by portfolio" columns={columns} rows={dataset.items} rowKey={(row) => row.rowKey} />;
}

/** A count of days the dataset publishes (`unit` DAYS), exact; the unit word follows the figure. */
export function DaysValue({ metric }: { metric: ManagerMetricRead | undefined | null }): ReactNode {
  if (metric === undefined || metric === null || metric.kind === "absent") return <MetricValue metric={metric} />;
  return <span className="exec-mgr-num" title={`${metric.exact} · ${metricTitle(metric)}`} data-zero={metric.zero ? "true" : undefined}>{`${metric.exact} ${metric.exact === "1" ? "day" : "days"}`}</span>;
}

export interface RowFigureProps {
  read: DatasetReadState;
  names: ReadonlyMap<string, string>;
  /** A key inside `economic_partitions[].metrics` of each dataset row (open key names: max_drawdown_pct, cost_drag_fees, ...). */
  metricKey: string;
  /** What prints when the dataset carries the key for no row (or the read failed): the `Not published (FE-xxx)` it had before. */
  fallback: ReactNode;
  cell?: (metric: ManagerMetricRead | null) => ReactNode;
  signed?: boolean;
}

/** One figure per dataset row and per economic partition for a key the dataset may or may not carry; nothing is added across rows. */
export function RowFigure({ read, names, metricKey, fallback, cell, signed }: RowFigureProps): ReactNode {
  if (read.phase === "idle" || read.phase === "loading") return <span className="exec-alp2-dim">Loading</span>;
  if (read.phase === "error") return <span>{fallback}<WhyMark name={`${metricKey}, reason`} reason={read.reason} /></span>;
  const rows = read.value.items.filter((row) => row.economicPartitions.some((entry) => entry.metrics.has(metricKey)));
  if (rows.length === 0) return <span>{fallback}<WhyMark name={`${metricKey}, reason`} reason={`The Manager dataset publishes no ${metricKey} for this alpha in this Book.`} /></span>;
  const several = rows.length > 1;
  return (
    <>
      {rows.map((row) => (
        <span key={row.rowKey} className="exec-alp2-fig">
          {several ? <span className="exec-alp2-dim">{rowLabel(row, names)} </span> : null}
          <PartitionFigures partitions={row.economicPartitions} metricKey={metricKey} metricKeys={null} gap={{ fe: "FE-025", what: metricKey }} cell={cell} signed={signed} />
        </span>
      ))}
    </>
  );
}
