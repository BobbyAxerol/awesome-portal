/**
 * Manager dataset figures, one cell per economic partition (execution-manager-dataset.v1), shared by Overview, Portfolios and
 * Portfolio 360.
 *
 * - Every partition is its own line: Real-funded (ACTUAL), Paper and Sandbox are never merged and two currencies are never added.
 *   There is no total in this file; `MetricValue` prints the published exact string (a true zero is a value) or the typed absence.
 * - Where a figure lives is the contract's: the dataset's `capital_statements` (before the table filters) or a `groups` entry
 *   (the whole filtered query, keyed by `portfolio_id`). Nothing is read from a row and added up here.
 * - A key that no partition publishes is not drawn from here: the caller keeps its own `Not published (FE-xxx)`.
 */
import type { ExecutionApi } from "../../../api/ports";
import type { ManagerDataset } from "../../readers/managerDataset";
import { figuresByPartition, type ManagerPartition, type ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { MetricValue } from "../manager/MetricValue";

import "./partitionFigures.css";

export const DOMAIN_WORD: Readonly<Record<ManagerPartition["economicDomain"], string>> = {
  ACTUAL: "Real-funded",
  PAPER: "Paper",
  SANDBOX: "Sandbox",
};

/** A port that predates the dataset (an older shell, a narrow test double) has no method: that is "not published", not a crash. */
export const servesDataset = (api: ExecutionApi): boolean => typeof api.getManagerDataset === "function";

export const partitionLabel = (partition: ManagerPartition): string => `${DOMAIN_WORD[partition.economicDomain]} · ${partition.currency}`;

/** True when at least one partition of the list publishes `key` (a typed absence counts: the contract spoke). */
export const publishes = (list: readonly ManagerPartitionedMetrics[], key: string): boolean => list.some((entry) => entry.metrics.has(key));

/** The group the dataset published for one portfolio (`group_by=portfolio_id`), as its per-partition figures. */
export function portfolioGroup(dataset: ManagerDataset, portfolioId: string): readonly ManagerPartitionedMetrics[] | null {
  const group = dataset.groups.find((g) => g.key.length === 1 && g.key[0]!.field === "portfolio_id" && g.key[0]!.value === portfolioId);
  return group === undefined ? null : group.economicPartitions;
}

/** Every published portfolio group, by portfolio id. */
export function groupsByPortfolio(dataset: ManagerDataset): ReadonlyMap<string, readonly ManagerPartitionedMetrics[]> {
  const out = new Map<string, readonly ManagerPartitionedMetrics[]>();
  for (const group of dataset.groups) {
    if (group.key.length === 1 && group.key[0]!.field === "portfolio_id" && group.key[0]!.value !== null) out.set(group.key[0]!.value, group.economicPartitions);
  }
  return out;
}

/**
 * Where `key` is published for a scope: the capital statements first, then the scope's own portfolio group. `null` when neither
 * says anything (the contract does not carry it, so the caller keeps its gap).
 */
export function figureSource(dataset: ManagerDataset | null, key: string, portfolioId?: string): readonly ManagerPartitionedMetrics[] | null {
  if (dataset === null) return null;
  if (publishes(dataset.capitalStatements, key)) return dataset.capitalStatements;
  const group = portfolioId === undefined ? null : portfolioGroup(dataset, portfolioId);
  return group !== null && publishes(group, key) ? group : null;
}

export function PartitionFigures({ list, metricKey, signed = false }: { list: readonly ManagerPartitionedMetrics[]; metricKey: string; signed?: boolean }) {
  return (
    <ul className="exec-part" aria-label={`${metricKey} by economic partition`}>
      {figuresByPartition(list, metricKey).map(({ partition, metric }) => (
        <li key={`${partition.economicDomain}|${partition.currency}|${partition.basis}|${partition.nativeProfileRef}`} className="exec-part-line" data-domain={partition.economicDomain}>
          <span className="exec-part-label" title={`${partition.basis} · ${partition.nativeProfileRef}`}>{partitionLabel(partition)}</span>
          <MetricValue metric={metric} signed={signed} />
        </li>
      ))}
    </ul>
  );
}
