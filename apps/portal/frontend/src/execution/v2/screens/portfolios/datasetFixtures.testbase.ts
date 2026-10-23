/**
 * Tests only: the Manager dataset the screens read through the port, built from the PUBLISHED canonical fixtures
 * (`execution-manager-dataset.rows` via `richDataset`) and judged by the real reader. Only what the screen under test needs is
 * rewritten: the surface, the portfolio the group is about, and the capital statements.
 *
 * Capital statements (before the table filters), one entry per economic partition, never totalled:
 * - ACTUAL  USDT  balance_total 2500.00 · allocation 1500.50   (Real-funded)
 * - PAPER   USDT  balance_total 1000.50 · allocation 0         (a TRUE ZERO, a value)
 * - PAPER   EUR   balance_total 900     · allocation absent (SOURCE_FACTS_NOT_PUBLISHED, a typed absence)
 * Group for `portfolioId`: net_pnl PAPER USDT 100.25, PAPER EUR -12.5, ACTUAL USDT 0 (a true zero).
 */
import type { ExecutionApi } from "../../../api/ports";
import { loadCanonical } from "../../testkit/loadCanonical";
import { readManagerDataset, type ManagerDataset, type ManagerSurface } from "../../readers/managerDataset";
import { compareDecimal } from "../../charts/decimal";
import { absentMetric, clone, moneyMetric, partition, richDataset, type Draft } from "../../readers/managerDataset.testbase";

export { loadCanonical };

export function datasetFor(surface: ManagerSurface, portfolioId: string, over: (body: Draft) => void = () => undefined): ManagerDataset {
  const body = richDataset();
  body.surface = surface;
  body.environment = "paper";
  const group = body.groups[0];
  group.key = [{ field: "portfolio_id", value: portfolioId }];
  group.economic_partitions.push({ partition: partition("ACTUAL", "USDT", "actual"), metrics: { net_pnl: moneyMetric({ value: "0" }) } });
  body.capital_statements = [
    { partition: partition("ACTUAL", "USDT", "actual"), metrics: { balance_total: moneyMetric({ value: "2500.00" }), allocation: moneyMetric({ value: "1500.50" }) } },
    { partition: partition("PAPER", "USDT", "usdt"), metrics: { balance_total: moneyMetric({ value: "1000.50" }), allocation: moneyMetric({ value: "0" }) } },
    {
      partition: partition("PAPER", "EUR", "eur"),
      metrics: { balance_total: moneyMetric({ currency: "EUR", value: "900" }), allocation: absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED" }) },
    },
  ];
  over(body);
  const read = readManagerDataset(clone(body));
  if (read === null || read.kind !== "dataset") throw new Error("the test dataset is not a dataset the reader accepts");
  return read.dataset;
}

/** The port with only the dataset swapped (every other read is the base double's). `calls` records each question asked. */
export function withDataset<T extends ExecutionApi>(api: T, answer: ((query: Parameters<ExecutionApi["getManagerDataset"]>[0]) => ManagerDataset | null) | null, calls: unknown[] = []): ExecutionApi {
  return {
    ...api,
    withReadSignal: undefined,
    async getManagerDataset(query) {
      calls.push(query);
      const dataset = answer === null ? null : answer(query);
      return dataset === null ? { ok: false as const, status: "unavailable" as const, reason: "The Manager dataset is not served." } : { ok: true as const, value: dataset, warnings: [] };
    },
  } as ExecutionApi;
}

/**
 * Tests only: a server that applies the WP-K group query to a dataset the way the contract says (a metric is read in the pinned partition, else in the
 * group's only partition; null sorts last both ways and fails GTE / LTE; IS_NULL keeps the nulls) and echoes `groupQuery`. A query without one is answered as is.
 */
export function applyGroupQueryToDataset(dataset: ManagerDataset, query: Parameters<ExecutionApi["getManagerDataset"]>[0]): ManagerDataset {
  const sort = query.groupSort ?? [];
  const filters = query.groupFilters ?? [];
  if (sort.length === 0 && filters.length === 0) return dataset;
  const pin = query.economicPartition;
  const valueOf = (group: ManagerDataset["groups"][number], key: string): string | null => {
    const pool = pin === undefined ? group.economicPartitions : group.economicPartitions.filter(({ partition: p }) => p.currency === pin.currency && p.economicDomain === pin.economicDomain && p.basis === pin.basis && p.nativeProfileRef === pin.nativeProfileRef);
    if (pool.length !== 1) return null;
    const metric = pool[0]!.metrics.get(key);
    return metric !== undefined && metric.kind === "value" ? metric.exact : null;
  };
  let kept = dataset.groups.filter((group) => filters.every((f) => {
    const v = valueOf(group, f.metricKey);
    if (f.op === "IS_NULL") return v === null;
    return v !== null && (f.op === "GTE" ? compareDecimal(v, f.value) >= 0 : compareDecimal(v, f.value) <= 0);
  }));
  const order = sort[0];
  if (order) {
    kept = [...kept].sort((a, b) => {
      const x = valueOf(a, order.metricKey), y = valueOf(b, order.metricKey);
      const tie = JSON.stringify(a.key) < JSON.stringify(b.key) ? -1 : 1;
      if (x === null || y === null) return x === y ? tie : x === null ? 1 : -1;
      return compareDecimal(x, y) === 0 ? tie : compareDecimal(x, y) * (order.direction === "asc" ? 1 : -1);
    });
  }
  return { ...dataset, groups: kept, groupQuery: {
    sort: sort.map((s) => ({ metricKey: s.metricKey, direction: s.direction })),
    filters: filters.map((f) => ({ metricKey: f.metricKey, op: f.op, value: f.op === "IS_NULL" ? null : f.value })),
    partitionBasis: pin === undefined ? "SINGLE_PARTITION_ONLY" : "PINNED_PARTITION", groupsBeforeFilter: dataset.groups.length, groupsReturned: kept.length } };
}
