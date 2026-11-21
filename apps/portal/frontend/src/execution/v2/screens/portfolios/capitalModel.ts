/**
 * Capital statement geometry (WP-F1): what a budget bar and a concentration bar may draw from PUBLISHED figures.
 *
 * The statement keys come from the dataset's `capital_statements` (one entry per economic partition) and the groups by `alpha_id`:
 *
 * - `allocation` against `current_budget` (the budget is a LIMIT, not cash): the bar shows how much of the approved budget is
 *   allocated and how much is being recalled. Each figure is the server's exact string and is printed as published; the only
 *   arithmetic is the bar's fill, a whole percent worked out in bigint from the two published strings of ONE partition (same
 *   currency, same domain). It is a drawing, not a figure: it carries no unit and is never printed as a result;
 * - `allocation_share_pct`: the share each alpha group publishes (percent, exact); a segment's width is that published number,
 *   never a share worked out here. A group that publishes none gets no segment.
 *
 * Nothing is added across partitions or currencies, nothing is defaulted: a missing, absent or not-comparable input gives `null`
 * and a sentence, never a zero-width bar that reads as "0% used".
 */
import type { ManagerMetricRead, ManagerMetricValue, ManagerPartition, ManagerPartitionedMetrics } from "../../readers/managerMetric";
import type { ManagerGroup } from "../../readers/managerDataset";

const DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const PLACES = 24;

/** An exact decimal string as a scaled bigint (24 places, truncated beyond that), or `null` when it is not a decimal. */
export function scaledOf(exact: string): bigint | null {
  const match = DECIMAL.exec(exact);
  if (match === null) return null;
  const digits = `${match[2]}${(match[3] ?? "").padEnd(PLACES, "0").slice(0, PLACES)}`;
  const n = BigInt(digits);
  return match[1] === "-" ? -n : n;
}

const valueOf = (metric: ManagerMetricRead | undefined): ManagerMetricValue | null => (metric !== undefined && metric.kind === "value" ? metric : null);

export interface BudgetUse {
  partition: ManagerPartition;
  /** `allocation`, as published. */
  used: ManagerMetricValue | null;
  /** `current_budget`, as published: the limit. */
  limit: ManagerMetricValue | null;
  /** `recalling`, as published. */
  recalling: ManagerMetricValue | null;
  /** Whole percent of the limit that is allocated, 0 to 100; `null` when it cannot be drawn. */
  usedPct: number | null;
  /** Whole percent of the limit that is recalling, kept inside what remains of the bar. */
  recallPct: number | null;
  /** Why there is no bar, or what the bar cannot say (over budget); `null` when it is plain. */
  note: string | null;
}

/** Whole percent of `part` in `whole`, clamped to 0..100; `null` unless both are non-negative decimals and `whole` is positive. */
export function wholePercent(part: string, whole: string): number | null {
  const p = scaledOf(part);
  const w = scaledOf(whole);
  if (p === null || w === null || w <= 0n || p < 0n) return null;
  const pct = (p * 100n) / w;
  return pct > 100n ? 100 : Number(pct);
}

/** One entry per economic partition that publishes a budget or an allocation, in the order the server listed them. */
export function budgetUse(list: readonly ManagerPartitionedMetrics[]): readonly BudgetUse[] {
  const out: BudgetUse[] = [];
  for (const entry of list) {
    const used = valueOf(entry.metrics.get("allocation"));
    const limit = valueOf(entry.metrics.get("current_budget"));
    const recalling = valueOf(entry.metrics.get("recalling"));
    if (!entry.metrics.has("allocation") && !entry.metrics.has("current_budget")) continue;
    let note: string | null = null;
    let usedPct: number | null = null;
    let recallPct: number | null = null;
    if (used === null || limit === null) {
      note = used === null && limit === null ? "Neither the allocation nor the budget is published." : used === null ? "The allocation is not published, so no bar is drawn." : "The approved budget is not published, so no bar is drawn.";
    } else if (used.currency !== limit.currency) {
      note = "The allocation and the budget are in different currencies, so no bar is drawn.";
    } else {
      usedPct = wholePercent(used.exact, limit.exact);
      if (usedPct === null) note = "The budget is not a positive amount, so no bar is drawn.";
      else {
        const over = (scaledOf(used.exact) ?? 0n) > (scaledOf(limit.exact) ?? 0n);
        if (over) note = "Allocated is above the approved budget.";
        if (recalling !== null) {
          const raw = wholePercent(recalling.exact, limit.exact);
          recallPct = raw === null ? null : Math.min(raw, 100 - usedPct);
        }
      }
    }
    out.push({ partition: entry.partition, used, limit, recalling, usedPct, recallPct, note });
  }
  return out;
}

export interface ShareSegment {
  /** The group key (`alpha_id`) as published. */
  id: string;
  /** The published percent, exact. */
  exact: string;
  /** Width in percent of the bar, the published number clamped to 0..100. */
  width: number;
}

export interface ShareBar {
  partition: ManagerPartition;
  segments: readonly ShareSegment[];
  /** Groups of this partition that publish no share (typed absence); the bar says how many. */
  withoutShare: number;
}

const partitionKey = (p: ManagerPartition): string => `${p.economicDomain}|${p.currency}|${p.basis}|${p.nativeProfileRef}`;

/** One bar per economic partition from the groups by `alpha_id`, in the server's group order. Widths are published numbers. */
export function shareBars(groups: readonly ManagerGroup[], key = "allocation_share_pct"): readonly ShareBar[] {
  const byPartition = new Map<string, { partition: ManagerPartition; segments: ShareSegment[]; without: number }>();
  for (const group of groups) {
    const id = group.key.length === 1 && group.key[0]!.field === "alpha_id" ? group.key[0]!.value : null;
    if (id === null) continue;
    for (const entry of group.economicPartitions) {
      const slot = byPartition.get(partitionKey(entry.partition)) ?? { partition: entry.partition, segments: [], without: 0 };
      const metric = valueOf(entry.metrics.get(key));
      const scaled = metric === null ? null : scaledOf(metric.exact);
      if (metric === null || scaled === null || scaled < 0n) slot.without += 1;
      else slot.segments.push({ id, exact: metric.exact, width: Math.min(100, Number(scaled / 10n ** BigInt(PLACES - 6)) / 1_000_000) });
      byPartition.set(partitionKey(entry.partition), slot);
    }
  }
  return [...byPartition.values()].map((slot) => ({ partition: slot.partition, segments: slot.segments, withoutShare: slot.without }));
}
