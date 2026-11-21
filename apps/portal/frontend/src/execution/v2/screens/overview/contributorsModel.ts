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
 * - the population is stated from what the dataset says (`page.authorized_filtered_count`, `totals_scope`, and `group_page`: returned of
 *   authorized_filtered groups, with the opaque cursors). Completeness is never guessed from the number of groups (exactly 200 can be all);
 * - when the dataset does not offer `alpha_id`, does not serve the read, answered another grouping or publishes no `net_pnl`,
 *   the view is a typed absence with a code, never an empty-looking panel and never a 0.
 *
 * The attribution (name, owner, and the reason codes of an absent one) is the group's own `attribution` (package 5), never a join
 * from the page rows or an identity lookup.
 */
import type { ManagerDataset, ManagerGroup } from "../../readers/managerDataset";
import type { ManagerMetricRead, ManagerPartition } from "../../readers/managerMetric";
import type { DatasetReadState } from "../manager/useManagerDataset";

export const CONTRIBUTORS_GROUP_FIELD = "alpha_id" as const;
/** The Portfolios view of the same panel (hi-fi tab "Portfolios"): the same read grouped by `portfolio_id` instead. */
export const CONTRIBUTORS_PORTFOLIO_FIELD = "portfolio_id" as const;
export type ContributorsField = typeof CONTRIBUTORS_GROUP_FIELD | typeof CONTRIBUTORS_PORTFOLIO_FIELD;
const WORD: Readonly<Record<ContributorsField, string>> = { alpha_id: "alpha", portfolio_id: "portfolio" };
/** Package 5: groups per page (a bounded page; 17/34/50 were the tested sizes). The 1 MiB response budget is never raised and no group is dropped silently. */
export const CONTRIBUTORS_GROUP_LIMIT = 34;
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

/** Package 5: who an alpha group is, straight from the group's own `attribution`; a null carries its typed reason (never joined from rows). */
export interface ContributorAttribution {
  name: string | null;
  nameReasonCode: "GROUP_NAME_NOT_PUBLISHED" | "GROUP_NAME_AMBIGUOUS" | null;
  ownerUserId: string | null;
  ownerReasonCode: "GROUP_OWNER_NOT_PUBLISHED" | "GROUP_OWNER_AMBIGUOUS" | null;
}

export interface ContributorGroup {
  /** Absent when the producer publishes no attribution for this group (an old producer, or a portfolio group). */
  attribution?: ContributorAttribution;
  /** The published group key (`alpha_id`, or `portfolio_id` in the Portfolios view); `null` is a group whose key says none. */
  alphaId: string | null;
  uniqueRowCount: number;
  lines: readonly ContributorLine[];
}

export interface ContributorsPopulation {
  /** `page.authorized_filtered_count`: the rows the groups total over. */
  authorizedFilteredCount: number;
  groupCount: number;
  /** Package 5 `group_page`: this page of groups inside ALL authorized filtered groups. `null` = the producer does not page groups and states no total. */
  groupPage: { limit: number; returned: number; total: number; hasNext: boolean; hasPrevious: boolean } | null;
  /** True only when `group_page` says this page is not every group. Completeness is never guessed from the number of groups. */
  partial: boolean;
  window: string;
  environment: string;
  statement: string;
}

export type ContributorsView =
  | { kind: "loading" }
  | { kind: "absent"; code: ContributorsAbsenceCode; reason: string }
  | { kind: "empty"; population: ContributorsPopulation; field?: ContributorsField }
  | { kind: "ready"; groups: readonly ContributorGroup[]; showReturn: boolean; showScore: boolean; population: ContributorsPopulation; field?: ContributorsField };

/** Whether the ungrouped fund dataset offers `alpha_id` as a group field. `null` while nothing has been read. */
export function alphaGroupOffered(fund: ManagerDataset | null, field: ContributorsField = CONTRIBUTORS_GROUP_FIELD): boolean | null {
  return fund === null ? null : fund.queryOptions.groupFields.includes(field);
}

const isFieldGroup = (group: ManagerGroup, field: ContributorsField): boolean => group.key.length === 1 && group.key[0]!.field === field;

function windowOf(dataset: ManagerDataset): string {
  const selected = dataset.selectedWindow;
  if (selected === null) return "none selected";
  return typeof selected.requested === "string" ? selected.requested : "custom range";
}

export function populationOf(dataset: ManagerDataset, field: ContributorsField = CONTRIBUTORS_GROUP_FIELD): ContributorsPopulation {
  const word = WORD[field];
  const count = dataset.page.authorizedFilteredCount;
  const groupCount = dataset.groups.length;
  const gp = dataset.groupPage;
  const groupPage = gp === undefined ? null : { limit: gp.limit, returned: gp.returnedCount, total: gp.authorizedFilteredCount, hasNext: gp.nextCursor !== null, hasPrevious: gp.previousCursor !== null };
  const partial = groupPage !== null && (groupPage.total > groupPage.returned || groupPage.hasNext || groupPage.hasPrevious);
  const window = windowOf(dataset);
  const base = `over ${count} authorized ${count === 1 ? "row" : "rows"} (full authorized filtered query), ${dataset.environment}, window ${window}`;
  // One line, once: the honest "top N of M" when the server pages the groups; otherwise only the number shown, with no claim about the rest.
  const statement = groupPage === null
    ? `${groupCount} ${word} ${groupCount === 1 ? "group" : "groups"} ${base}. The server did not state how many groups exist.`
    : partial
      ? `Top ${groupPage.returned} of ${groupPage.total} ${word} groups on this page ${base}. Group totals cover each group's whole population.`
      : `${groupPage.total} ${word} ${groupPage.total === 1 ? "group" : "groups"}, all shown, ${base}.`;
  return { authorizedFilteredCount: count, groupCount, groupPage, partial, window, environment: dataset.environment, statement };
}

const absent = (code: ContributorsAbsenceCode, reason: string): ContributorsView => ({ kind: "absent", code, reason });

export interface ContributorsInput {
  /** The port has `getManagerDataset` at all. */
  served: boolean;
  /** The ungrouped fund read the Overview already makes (its query options say what may be grouped). */
  fundRead: DatasetReadState;
  fund: ManagerDataset | null;
  grouped: DatasetReadState;
  /** The grouping the `grouped` read asked for. Default `alpha_id`. */
  field?: ContributorsField;
}

export function contributorsView({ served, fundRead, fund, grouped, field = CONTRIBUTORS_GROUP_FIELD }: ContributorsInput): ContributorsView {
  if (!served) return absent("DATASET_NOT_SERVED", "This shell does not serve the Manager dataset.");
  if (fund === null) {
    return fundRead.phase === "error"
      ? absent("DATASET_READ_FAILED", fundRead.reason)
      : fundRead.phase === "idle" ? absent("DATASET_NOT_SERVED", "The fund dataset was not asked.") : { kind: "loading" };
  }
  if (alphaGroupOffered(fund, field) === false) return absent("GROUP_FIELD_NOT_OFFERED", `The fund dataset does not offer ${field} in query_options.group_fields.`);
  const dataset = grouped.phase === "ready" ? grouped.value : grouped.phase === "loading" || grouped.phase === "error" ? grouped.last : null;
  if (dataset === null) {
    if (grouped.phase === "error") return absent("DATASET_READ_FAILED", grouped.reason);
    return grouped.phase === "idle" ? absent("DATASET_NOT_SERVED", "The grouped read was not asked.") : { kind: "loading" };
  }
  if (alphaGroupOffered(dataset, field) === false) return absent("GROUP_FIELD_NOT_OFFERED", `The dataset does not offer ${field} in query_options.group_fields.`);
  if (dataset.groups.some((group) => !isFieldGroup(group, field))) return absent("GROUPING_NOT_ANSWERED", `The dataset answered a different grouping than ${field}, so it is not drawn as contributors.`);
  const population = populationOf(dataset, field);
  if (dataset.groups.length === 0) {
    return dataset.page.authorizedFilteredCount === 0
      ? { kind: "empty", population, ...(field !== CONTRIBUTORS_GROUP_FIELD ? { field } : {}) }
      : absent("NO_GROUPS_PUBLISHED", `The dataset counts ${dataset.page.authorizedFilteredCount} authorized rows but publishes no ${WORD[field]} group.`);
  }
  const groups: ContributorGroup[] = dataset.groups.map((group) => ({
    alphaId: group.key[0]!.value,
    ...(group.attribution === undefined ? {} : { attribution: { name: group.attribution.name, nameReasonCode: group.attribution.nameReasonCode, ownerUserId: group.attribution.ownerUserId, ownerReasonCode: group.attribution.ownerReasonCode } }),
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
  return { kind: "ready", groups, showReturn: any((line) => line.ret), showScore: any((line) => line.score), population, ...(field !== CONTRIBUTORS_GROUP_FIELD ? { field } : {}) };
}
