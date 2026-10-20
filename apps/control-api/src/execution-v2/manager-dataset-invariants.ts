import { z } from "zod";
import { accessDigest } from "./access-digest";

/**
 * Producer invariants of the Manager dataset body that JSON Schema cannot state (equality between two fields,
 * identity inside a list, membership of a field in a sibling list). They run inside `managerDatasetResponse`, so a
 * body that breaks one is never emitted: the service turns the failed parse into EXECUTION_READ_AUTHORITY_UNAVAILABLE
 * (503), never into a degraded body. Each message is a stable code (MD-n = UXM-07 conformance matrix gap n).
 *
 * The published schema carries the part it can say (uniqueItems for an exact repeat, the group field enum, the
 * preset window) and the description of the rest; this file is the rest.
 *
 * Deliberately NOT here: negative zero (MD-5). That one needs an owner decision (see BE-P1 ledger).
 */
interface PartitionLike { economic_domain: string; currency: string; basis: string; native_profile_ref: string }
interface MetricLike { currency: string | null }
interface PartitionedMetricsLike { partition: PartitionLike; metrics: Record<string, MetricLike> }
export interface ManagerDatasetInvariantInput {
  query_options: { group_fields: readonly string[] };
  page: { limit: number; returned_count: number; authorized_filtered_count: number; next_cursor: string | null; previous_cursor: string | null };
  items: Array<{ row_key: string; metrics: Record<string, MetricLike>; economic_partitions: PartitionedMetricsLike[] }>;
  groups: Array<{ key: Array<{ field: string }>; unique_row_count: number; economic_partitions: PartitionedMetricsLike[] }>;
  capital_statements: PartitionedMetricsLike[];
}

/** The identity of an economic partition. `domain_proof_ref` is evidence, not identity (same as managerPartitionKey). */
const partitionIdentity = (p: PartitionLike) => JSON.stringify([p.economic_domain, p.currency, p.basis, p.native_profile_ref]);
/** Same list as `managerMoneyFields` (manager-model.contract.ts imports this file, so it cannot import that list back;
 * a test pins the two equal). */
export const MANAGER_DATASET_MONEY_KEYS = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"] as const;
const moneyKeys: ReadonlySet<string> = new Set(MANAGER_DATASET_MONEY_KEYS);

export function validateManagerDatasetInvariants(v: ManagerDatasetInvariantInput, c: z.RefinementCtx): void {
  const issue = (path: Array<string | number>, message: string) => c.addIssue({ code: z.ZodIssueCode.custom, path, message });

  // MD-1: the page counts what the body holds. A cursor-less non-empty page is the whole filtered result.
  const { page } = v;
  if (page.returned_count !== v.items.length) issue(["page", "returned_count"], "MANAGER_PAGE_RETURNED_COUNT_MISMATCH");
  if (page.returned_count > page.limit) issue(["page", "returned_count"], "MANAGER_PAGE_RETURNED_OVER_LIMIT");
  if (page.returned_count > page.authorized_filtered_count) issue(["page", "returned_count"], "MANAGER_PAGE_RETURNED_OVER_FILTERED");
  if (page.next_cursor === null && page.previous_cursor === null && v.items.length > 0 && v.items.length !== page.authorized_filtered_count)
    issue(["page"], "MANAGER_PAGE_CURSOR_MISSING");

  // MD-6: a row appears once (the reader keys React lists and selection by row_key).
  const rowKeys = new Set<string>();
  v.items.forEach((row, i) => {
    if (rowKeys.has(row.row_key)) issue(["items", i, "row_key"], "MANAGER_ROW_KEY_DUPLICATE");
    rowKeys.add(row.row_key);
  });

  // MD-3 and MD-2: a partition appears once per list, and a metric that names a currency names its partition's.
  const checkPartitions = (list: PartitionedMetricsLike[], path: Array<string | number>) => {
    const seen = new Set<string>();
    list.forEach((entry, i) => {
      const identity = partitionIdentity(entry.partition);
      if (seen.has(identity)) issue([...path, i, "partition"], "MANAGER_PARTITION_DUPLICATE");
      seen.add(identity);
      for (const [key, metric] of Object.entries(entry.metrics))
        if (metric.currency !== null && metric.currency !== entry.partition.currency)
          issue([...path, i, "metrics", key, "currency"], "MANAGER_PARTITION_CURRENCY_MISMATCH");
    });
  };
  checkPartitions(v.capital_statements, ["capital_statements"]);
  v.items.forEach((row, i) => checkPartitions(row.economic_partitions, ["items", i, "economic_partitions"]));
  v.groups.forEach((group, i) => checkPartitions(group.economic_partitions, ["groups", i, "economic_partitions"]));

  // MD-8: a row-level money figure that names a currency is the figure of ONE published partition of that row, never a
  // total across partitions. Compared as a whole (same metric, not only the same currency): when a query pins one
  // partition the headline is that partition's metric while the row still lists its other partitions, so the rule is
  // identity, not "same currency as every partition".
  v.items.forEach((row, i) => {
    for (const [key, headline] of Object.entries(row.metrics)) {
      if (!moneyKeys.has(key) || headline.currency === null) continue;
      const digest = accessDigest(headline);
      if (!row.economic_partitions.some(p => key in p.metrics && accessDigest(p.metrics[key]) === digest))
        issue(["items", i, "metrics", key], "MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE");
    }
  });

  // MD-6 / MD-7: a group appears once, names a field once, over a field the options offer, and holds no more unique rows
  // than the filtered query it totals over.
  const offered = new Set(v.query_options.group_fields), groupKeys = new Set<string>();
  v.groups.forEach((group, i) => {
    const identity = JSON.stringify(group.key);
    if (groupKeys.has(identity)) issue(["groups", i, "key"], "MANAGER_GROUP_DUPLICATE");
    groupKeys.add(identity);
    if (new Set(group.key.map(k => k.field)).size !== group.key.length) issue(["groups", i, "key"], "MANAGER_GROUP_KEY_FIELD_DUPLICATE");
    if (group.key.some(k => !offered.has(k.field))) issue(["groups", i, "key"], "MANAGER_GROUP_FIELD_NOT_OFFERED");
    if (group.unique_row_count > page.authorized_filtered_count) issue(["groups", i, "unique_row_count"], "MANAGER_GROUP_COUNT_OVER_FILTERED");
  });
}
