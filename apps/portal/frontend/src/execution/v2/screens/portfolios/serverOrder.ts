/**
 * The Portfolios register asks the SERVER to sort and range-filter the portfolio groups (WP-K slice 6: `group_sort` / `group_filters` on the Manager
 * dataset grouped by `portfolio_id`). Pure functions, no React.
 *
 * What is asked, and when it is NOT asked (the register then keeps its local order and says so):
 * - the sort key maps to a published group metric (`pnl` net_pnl, `ret` return_30d_pct, `dd` max_drawdown_pct, `score` portfolio_score, `allocated` allocation,
 *   `hhi` concentration_hhi); name, owner and the other list columns stay local;
 * - a range maps to GTE (min) and LTE (max) on the same metric; both ends are exact decimal text, inclusive;
 * - money never mixes currencies: with a page currency the request pins THE ONE partition of that currency (when the groups hold more than one distinct
 *   partition of it, nothing can be pinned and the local order is kept); without a currency a money sort is not asked (the register already sorts by name then);
 * - every metric asked must be one a group publishes; otherwise the register keeps its local order.
 * The server's answer is trusted for ORDER and MEMBERSHIP only; every figure still comes from the groups.
 */
import type { ManagerDatasetGroupFilter, ManagerDatasetGroupSort, ManagerDatasetPartitionQuery } from "../../../api/managerDatasetQuery";
import type { ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { publishes } from "./PartitionFigures";
import { RANGES, SCORE_KEYS, type Range, type RangeId } from "./registerMetrics";
import { MONEY_SORT_KEYS, type SortSpec } from "./listModel";

export const SERVER_SORT_METRIC: Readonly<Partial<Record<SortSpec["key"], string>>> = {
  pnl: "net_pnl", ret: "return_30d_pct", dd: "max_drawdown_pct", score: SCORE_KEYS.score, allocated: "allocation", hhi: "concentration_hhi",
};
const MONEY_METRICS: readonly string[] = ["net_pnl", "allocation"];

export interface GroupAsk {
  groupSort: readonly ManagerDatasetGroupSort[];
  groupFilters: readonly ManagerDatasetGroupFilter[];
  economicPartition?: ManagerDatasetPartitionQuery;
}

/** The one partition of `currency` the groups hold, or `null` when there is none or more than one (it cannot be pinned). */
export function pinnedPartition(groups: ReadonlyMap<string, readonly ManagerPartitionedMetrics[]>, currency: string): ManagerDatasetPartitionQuery | null {
  const found = new Map<string, ManagerDatasetPartitionQuery>();
  for (const partitions of groups.values()) {
    for (const { partition } of partitions) {
      if (partition.currency !== currency) continue;
      found.set(JSON.stringify([partition.economicDomain, partition.basis, partition.nativeProfileRef, partition.domainProofRef]),
        { economicDomain: partition.economicDomain, currency: partition.currency, basis: partition.basis, nativeProfileRef: partition.nativeProfileRef, domainProofRef: partition.domainProofRef });
    }
  }
  return found.size === 1 ? [...found.values()][0]! : null;
}

/** What to ask the server, or `null` when the register keeps its local order. */
export function groupAsk(input: {
  sort: SortSpec; ranges: Readonly<Partial<Record<RangeId, Range>>>; currency: string | null;
  groups: ReadonlyMap<string, readonly ManagerPartitionedMetrics[]> | null;
}): GroupAsk | null {
  const { sort, ranges, currency, groups } = input;
  if (groups === null) return null;
  const published = (key: string) => [...groups.values()].some((group) => publishes(group, key));
  const filters: ManagerDatasetGroupFilter[] = [];
  for (const spec of RANGES) {
    const range = ranges[spec.id];
    if (range === undefined) continue;
    const metricKey = spec.key ?? "allocation";
    if (!published(metricKey) || (MONEY_METRICS.includes(metricKey) && currency === null)) return null;
    if (range.min !== null) filters.push({ metricKey, op: "GTE", value: range.min });
    if (range.max !== null) filters.push({ metricKey, op: "LTE", value: range.max });
  }
  const sortMetric = SERVER_SORT_METRIC[sort.key];
  const sorted = sortMetric !== undefined && published(sortMetric) && !(MONEY_SORT_KEYS.includes(sort.key) && currency === null);
  if (!sorted && filters.length === 0) return null;
  const economicPartition = currency === null ? undefined : pinnedPartition(groups, currency);
  if (currency !== null && economicPartition === null) return null;
  return {
    groupSort: sorted ? [{ metricKey: sortMetric!, direction: sort.dir }] : [],
    groupFilters: filters,
    ...(economicPartition ? { economicPartition } : {}),
  };
}

/**
 * Membership and order from the server's group list. `ids` is the portfolio ids of the groups in the order the server returned them.
 * A sort puts the portfolios the server listed first, in its order; the portfolios it did not list (no figure) follow in the order `rest` gives them (the register's local order), unless a
 * range filter is active (then they are outside it). A filter without a sort keeps the caller's order and drops the portfolios the server did not list.
 */
export function applyServerOrder<T extends { portfolioId: string }>(rows: readonly T[], ids: readonly string[], opts: { sorted: boolean; filtered: boolean; rest?: (rows: readonly T[]) => readonly T[] }): readonly T[] {
  const at = new Map(ids.map((id, index) => [id, index]));
  const listed = rows.filter((row) => at.has(row.portfolioId));
  if (!opts.sorted) return opts.filtered ? listed : rows;
  const ordered = [...listed].sort((a, b) => at.get(a.portfolioId)! - at.get(b.portfolioId)!);
  const unlisted = rows.filter((row) => !at.has(row.portfolioId));
  return opts.filtered ? ordered : [...ordered, ...(opts.rest ? opts.rest(unlisted) : unlisted)];
}
