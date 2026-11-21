/**
 * One money metric of a Manager dataset row, one cell per ECONOMIC PARTITION (domain + currency + basis).
 *
 * The dataset publishes a row's figures inside `economic_partitions`; this component prints exactly those, in published order, and
 * nothing else: no total over partitions, no conversion, no merge of a Real-funded and a Paper book. A partition that does not
 * publish the key shows the typed absence; a dataset whose `query_options.metric_keys` does not carry the key shows
 * `Not published (FE id)` for the whole column. The figure itself is `MetricValue` (exact string, true zero kept, absence + reason).
 */
import type { ReactNode } from "react";

import { NaWhy } from "../../blocks";
import type { ManagerEconomicDomain, ManagerMetricRead, ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { MetricValue } from "../manager/MetricValue";
import { notPublished, type UnpublishedFact } from "./fleetModel";

import "./partitionFigures.css";

export const DOMAIN_LABEL: Readonly<Record<ManagerEconomicDomain, string>> = { ACTUAL: "Real-funded", PAPER: "Paper", SANDBOX: "Sandbox" };

export interface PartitionFiguresProps {
  partitions: readonly ManagerPartitionedMetrics[];
  /** The key inside `economic_partitions[].metrics` (`allocation`, `net_pnl`, `equity_30d_end_value`). */
  metricKey: string;
  /** `query_options.metric_keys` of the dataset, or `null` when unknown. A key the dataset does not carry is not published. */
  metricKeys: readonly string[] | null;
  /** The request that publishes the figure when the dataset does not carry the key. */
  gap: UnpublishedFact;
  signed?: boolean;
  /** How a figure of another unit prints (a percent, a count of days). Default: the money / exact renderer. */
  cell?: (metric: ManagerMetricRead | null) => ReactNode;
}

/** The short chip the table prints in place of the word (the word stays in the DOM, the title and the legend line above the table). Never merged across domains. */
export const DOMAIN_SHORT: Readonly<Record<ManagerEconomicDomain, string>> = { ACTUAL: "REAL", PAPER: "PAPER", SANDBOX: "SIM" };

export const partitionTag = (entry: ManagerPartitionedMetrics): string => `${DOMAIN_LABEL[entry.partition.economicDomain]} · ${entry.partition.currency}`;

/**
 * Everything the cell's partition says about itself (FE-CAT-7): the economic domain, currency, basis and profile. The cell is that
 * partition's figure and nothing else; the ownership of a balance is not published and is named so in the Fleet's disclosure.
 */
export const partitionTitle = (entry: ManagerPartitionedMetrics): string =>
  `${DOMAIN_LABEL[entry.partition.economicDomain]} (${entry.partition.economicDomain}) · ${entry.partition.currency} · basis ${entry.partition.basis} · profile ${entry.partition.nativeProfileRef}`;

export function PartitionFigures({ partitions, metricKey, metricKeys, gap, signed = false, cell }: PartitionFiguresProps) {
  if (metricKeys !== null && !metricKeys.includes(metricKey)) {
    return <NaWhy className="exec-fleet-np" text={notPublished(gap)} reason={`The Manager dataset does not carry ${metricKey} in its published metric set.`} />;
  }
  if (partitions.length === 0) {
    return <NaWhy className="exec-fleet-np" reason="This row publishes no economic partition, so there is no figure to print." />;
  }
  return (
    <span className="exec-fleet-parts">
      {partitions.map((entry) => {
        const metric: ManagerMetricRead | null = entry.metrics.get(metricKey) ?? null;
        return (
          <span key={`${entry.partition.economicDomain}|${entry.partition.currency}|${entry.partition.basis}|${entry.partition.nativeProfileRef}`}
            className="exec-fleet-part" data-domain={entry.partition.economicDomain} data-testid={`part-${metricKey}`}>
            <span className="exec-fleet-part-tag" data-short={DOMAIN_SHORT[entry.partition.economicDomain]} title={partitionTitle(entry)}>
              {DOMAIN_LABEL[entry.partition.economicDomain]}
              {/* The currency is the figure's own suffix; it stays in the tag for assistive technology and in the text, not on screen twice. */}
              <span className="exec-fleet-sr"> · {entry.partition.currency}</span>
            </span>
            {cell ? cell(metric) : <MetricValue metric={metric} signed={signed} />}
          </span>
        );
      })}
    </span>
  );
}
