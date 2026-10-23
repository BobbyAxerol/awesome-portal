/**
 * Overview Contributors, pure model (FE-CAT-5, closeout 2026-10-23 section 5).
 *
 * The contributors are the SERVER's grouping: a second read of the same FUND dataset, same environment and window, with
 * `group_by=alpha_id`. Each group already carries `economic_partitions[].metrics` over the whole authorized filtered query
 * (`totals_scope`), so this file only selects and labels what was published:
 *
 * - one line per economic partition of a group, never added across partitions or currencies; no join to rows, no re-aggregation;
 * - the order is the server's (no sort is requested and none is applied here);
 * - `net_pnl` is the Amount. Return (`return_30d_pct`) and Score (`score`) are columns only when some group publishes the key;
 *   a partition that does not publish it is a typed absence in its cell. A published exact zero is a value, never an absence;
 * - the population is stated from what the dataset says (`page.authorized_filtered_count`, `totals_scope`, the number of groups).
 *   A list at the server's group cap is named as not the whole population;
 * - when the dataset does not offer `alpha_id`, does not serve the read, answered another grouping or publishes no `net_pnl`,
 *   the view is a typed absence with a code, never an empty-looking panel and never a 0.
 *
 * The attribution is the group key (`alpha_id`) as published. A group carries no display name; resolving one from the page rows
 * would be a client-side join, so it is not done (accepted for implementation: Edge publishes the name with the group).
 */
import type { ManagerDataset, ManagerGroup } from "../../readers/managerDataset";
import { MAX_GROUPS } from "../../readers/managerDataset";
import type { ManagerMetricRead, ManagerPartition } from "../../readers/managerMetric";
import type { DatasetReadState } from "../manager/useManagerDataset";

export const CONTRIBUTORS_GROUP_FIELD = "alpha_id" as const;
export const CONTRIBUTORS_AMOUNT_KEY = "net_pnl";
export const CONTRIBUTORS_RETURN_KEY = "return_30d_pct";
export const CONTRIBUTORS_SCORE_KEY = "score";

export type ContributorsAbsenceCode =
  | "DATASET_NOT_SERVED"
  | "DATASET_READ_FAILED"
  | "GROUP_FIELD_NOT_OFFERED"
  | "GROUPING_NOT_ANSWERED"
  | "NO_GROUPS_PUBLISHED"
  | "METRIC_NOT_PUBLISHED";

export interface ContributorLine {
  partition: ManagerPartition;
  amount: ManagerMetricRead | null;
  ret: ManagerMetricRead | null;
  score: ManagerMetricRead | null;
}

export interface ContributorGroup {
  /** The published `alpha_id` of the group key; `null` is a group whose key says no alpha. */
  alphaId: string | null;
  uniqueRowCount: number;
  lines: readonly ContributorLine[];
}

export interface ContributorsPopulation {
  /** `page.authorized_filtered_count`: the rows the groups total over. */
  authorizedFilteredCount: number;
  groupCount: number;
  /** The server lists at most MAX_GROUPS groups: at the cap the list may be a page of a larger population. */
  atGroupCap: boolean;
  window: string;
  environment: string;
  statement: string;
}

export type ContributorsView =
  | { kind: "loading" }
  | { kind: "absent"; code: ContributorsAbsenceCode; reason: string }
  | { kind: "empty"; population: ContributorsPopulation }
  | { kind: "ready"; groups: readonly ContributorGroup[]; showReturn: boolean; showScore: boolean; population: ContributorsPopulation };

/** Whether the ungrouped fund dataset offers `alpha_id` as a group field. `null` while nothing has been read. */
export function alphaGroupOffered(fund: ManagerDataset | null): boolean | null {
  return fund === null ? null : fund.queryOptions.groupFields.includes(CONTRIBUTORS_GROUP_FIELD);
}

const isAlphaGroup = (group: ManagerGroup): boolean => group.key.length === 1 && group.key[0]!.field === CONTRIBUTORS_GROUP_FIELD;

function windowOf(dataset: ManagerDataset): string {
  const selected = dataset.selectedWindow;
  if (selected === null) return "none selected";
  return typeof selected.requested === "string" ? selected.requested : "custom range";
}

export function populationOf(dataset: ManagerDataset): ContributorsPopulation {
  const count = dataset.page.authorizedFilteredCount;
  const groupCount = dataset.groups.length;
  const atGroupCap = groupCount >= MAX_GROUPS;
  const window = windowOf(dataset);
  const statement = atGroupCap
    ? `The first ${groupCount} alpha groups only. The server lists at most ${MAX_GROUPS} groups, so this is not the whole population of ${count} authorized rows.`
    : `${groupCount} alpha ${groupCount === 1 ? "group" : "groups"} over ${count} authorized ${count === 1 ? "row" : "rows"} (full authorized filtered query), ${dataset.environment}, window ${window}.`;
  return { authorizedFilteredCount: count, groupCount, atGroupCap, window, environment: dataset.environment, statement };
}

const absent = (code: ContributorsAbsenceCode, reason: string): ContributorsView => ({ kind: "absent", code, reason });

export interface ContributorsInput {
  /** The port has `getManagerDataset` at all. */
  served: boolean;
  /** The ungrouped fund read the Overview already makes (its query options say what may be grouped). */
  fundRead: DatasetReadState;
  fund: ManagerDataset | null;
  grouped: DatasetReadState;
}

export function contributorsView({ served, fundRead, fund, grouped }: ContributorsInput): ContributorsView {
  if (!served) return absent("DATASET_NOT_SERVED", "This shell does not serve the Manager dataset.");
  if (fund === null) {
    return fundRead.phase === "error"
      ? absent("DATASET_READ_FAILED", fundRead.reason)
      : fundRead.phase === "idle" ? absent("DATASET_NOT_SERVED", "The fund dataset was not asked.") : { kind: "loading" };
  }
  if (alphaGroupOffered(fund) === false) return absent("GROUP_FIELD_NOT_OFFERED", "The fund dataset does not offer alpha_id in query_options.group_fields.");
  const dataset = grouped.phase === "ready" ? grouped.value : grouped.phase === "loading" || grouped.phase === "error" ? grouped.last : null;
  if (dataset === null) {
    if (grouped.phase === "error") return absent("DATASET_READ_FAILED", grouped.reason);
    return grouped.phase === "idle" ? absent("DATASET_NOT_SERVED", "The grouped read was not asked.") : { kind: "loading" };
  }
  if (alphaGroupOffered(dataset) === false) return absent("GROUP_FIELD_NOT_OFFERED", "The dataset does not offer alpha_id in query_options.group_fields.");
  if (dataset.groups.some((group) => !isAlphaGroup(group))) return absent("GROUPING_NOT_ANSWERED", "The dataset answered a different grouping than alpha_id, so it is not drawn as contributors.");
  const population = populationOf(dataset);
  if (dataset.groups.length === 0) {
    return dataset.page.authorizedFilteredCount === 0
      ? { kind: "empty", population }
      : absent("NO_GROUPS_PUBLISHED", `The dataset counts ${dataset.page.authorizedFilteredCount} authorized rows but publishes no alpha group.`);
  }
  const groups: ContributorGroup[] = dataset.groups.map((group) => ({
    alphaId: group.key[0]!.value,
    uniqueRowCount: group.uniqueRowCount,
    lines: group.economicPartitions.map((entry) => ({
      partition: entry.partition,
      amount: entry.metrics.get(CONTRIBUTORS_AMOUNT_KEY) ?? null,
      ret: entry.metrics.get(CONTRIBUTORS_RETURN_KEY) ?? null,
      score: entry.metrics.get(CONTRIBUTORS_SCORE_KEY) ?? null,
    })),
  }));
  const any = (pick: (line: ContributorLine) => ManagerMetricRead | null): boolean => groups.some((group) => group.lines.some((line) => pick(line) !== null));
  if (!any((line) => line.amount)) return absent("METRIC_NOT_PUBLISHED", "No group publishes net_pnl, so there is no amount to draw.");
  return { kind: "ready", groups, showReturn: any((line) => line.ret), showScore: any((line) => line.score), population };
}
