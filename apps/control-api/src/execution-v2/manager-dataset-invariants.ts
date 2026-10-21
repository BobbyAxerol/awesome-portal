import { z } from "zod";
import { accessDigest } from "./access-digest";
import { exactDecimal } from "./foundation.contract";

/**
 * Producer invariants of the Manager dataset body that JSON Schema cannot state (equality between two fields,
 * identity inside a list, membership of a field in a sibling list). They run inside `managerDatasetResponse`, so a
 * body that breaks one is never emitted: the service turns the failed parse into EXECUTION_READ_AUTHORITY_UNAVAILABLE
 * (503), never into a degraded body. Each message is a stable code (MD-n = UXM-07 conformance matrix gap n).
 *
 * The published schema carries the part it can say (uniqueItems for an exact repeat, the group field enum, the
 * preset window) and the description of the rest; this file is the rest.
 *
 * MD-5 (negative zero) is the one rule that is a form, not a relation: see "Canonical zero" below. The owner chose option C
 * (2026-10-20): canonical zero ON EMIT, limited to the Manager decimals of the dataset and series RESPONSES.
 */
/* ───────────── MD-5 canonical zero (owner decision C, 2026-10-20) ─────────────
 * A zero with a minus sign ("-0", "-0.00") is a signed nothing: numerically identical to "0"/"0.00", but string equality,
 * digests and sort ties would tell the two apart. The Manager RESPONSE therefore never carries one:
 *   - the emit step (`canonicalizeManagerDatasetZero` / `canonicalizeManagerSeriesZero`) rewrites it, exactly once, before the
 *     response parse: same scale, no sign ("-0" -> "0", "-0.00" -> "0.00"). It never rounds, never changes a scale and never
 *     touches a non-zero value, so it is idempotent;
 *   - the response decimal (`managerResponseDecimal`) refuses the form, so a body that still carries one is never emitted.
 * What is NOT changed: the shared `exactDecimal` (other families use it), what a SOURCE document may contain (admission is
 * unchanged), stored source facts and their digests, and the sealed score / composition / regime publications that a dataset
 * passes through verbatim (`score_details`, `composition_details`, `regime_details`). */
const NEGATIVE_ZERO = /^-(0(?:\.0+)?)$/;
/** Canonical zero of one exact decimal: "-0" -> "0", "-0.00" -> "0.00"; every other string is returned as it is. */
export function canonicalManagerZero(value: string): string;
export function canonicalManagerZero(value: string | null): string | null;
export function canonicalManagerZero(value: string | null): string | null { return value === null ? null : value.replace(NEGATIVE_ZERO, "$1"); }
/** Positive zero or a non-zero value; never a signed zero. The last regex is the one the published JSON Schema carries
 * (lookahead-free: negative values are a non-zero integer part, or a zero integer part with a non-zero fraction digit). */
export const MANAGER_CANONICAL_DECIMAL_PATTERN = /^(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|-(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*))$/;
export const MANAGER_NEGATIVE_ZERO_CODE = "MANAGER_DECIMAL_NEGATIVE_ZERO";
export const MANAGER_CANONICAL_ZERO_NOTE = "Canonical zero: a zero is never signed. \"0\" and \"0.00\" are valid, \"-0\" and \"-0.00\" are not; " +
  "a source value of \"-0.00\" is published as \"0.00\" (same scale, no sign). The producer refuses to emit the signed form (" + MANAGER_NEGATIVE_ZERO_CODE + ").";
/** The decimal of a Manager RESPONSE (dataset metric value/denominator, score summaries, series points). */
export const managerResponseDecimal = exactDecimal.regex(MANAGER_CANONICAL_DECIMAL_PATTERN, MANAGER_NEGATIVE_ZERO_CODE);

interface DecimalMetricLike { value: string | null; denominator: string | null }
interface DecimalPartitionLike<M extends DecimalMetricLike> { metrics: Record<string, M> }
export interface ManagerDatasetZeroInput<M extends DecimalMetricLike, P extends DecimalPartitionLike<M>> {
  items: Array<{ metrics: Record<string, M>; economic_partitions: P[] }>;
  groups: Array<{ economic_partitions: P[] }>;
  capital_statements: P[];
  scores: { raw: { value: string | null }; composition: { value: string | null }; direct_nav: { value: string | null } };
}
const canonicalMetric = <M extends DecimalMetricLike>(metric: M): M => {
  const value = canonicalManagerZero(metric.value), denominator = canonicalManagerZero(metric.denominator);
  return value === metric.value && denominator === metric.denominator ? metric : { ...metric, value, denominator };
};
const canonicalMetrics = <M extends DecimalMetricLike>(metrics: Record<string, M>): Record<string, M> =>
  Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [key, canonicalMetric(metric)]));
const canonicalPartitions = <M extends DecimalMetricLike, P extends DecimalPartitionLike<M>>(list: P[]): P[] =>
  list.map(entry => ({ ...entry, metrics: canonicalMetrics(entry.metrics) }));
const canonicalSummary = <S extends { value: string | null }>(summary: S): S => {
  const value = canonicalManagerZero(summary.value);
  return value === summary.value ? summary : { ...summary, value };
};
/**
 * The emit step of the Manager dataset (MD-5). Pure: returns a new body, never edits the input (a metric object may be the
 * very object of a stored source fact). Covers every decimal the producer builds: row headline metrics, row / group /
 * capital-statement partition metrics (`value`, `denominator`) and the three score summaries. Idempotent.
 */
export function canonicalizeManagerDatasetZero<M extends DecimalMetricLike, P extends DecimalPartitionLike<M>, B extends ManagerDatasetZeroInput<M, P>>(body: B): B {
  return { ...body,
    items: body.items.map(row => ({ ...row, metrics: canonicalMetrics(row.metrics), economic_partitions: canonicalPartitions(row.economic_partitions) })),
    groups: body.groups.map(group => ({ ...group, economic_partitions: canonicalPartitions(group.economic_partitions) })),
    capital_statements: canonicalPartitions(body.capital_statements),
    scores: { ...body.scores, raw: canonicalSummary(body.scores.raw), composition: canonicalSummary(body.scores.composition),
      direct_nav: canonicalSummary(body.scores.direct_nav) } };
}
/** The emit step of the Manager series (MD-5): every point value of every subject. Pure and idempotent. */
export function canonicalizeManagerSeriesZero<B extends { series: Array<{ points: Array<{ value: string }> }> }>(body: B): B {
  return { ...body, series: body.series.map(entry => ({ ...entry, points: entry.points.map(point => {
    const value = canonicalManagerZero(point.value);
    return value === point.value ? point : { ...point, value };
  }) })) };
}

/* ───────────── MD-S1 / MD-S4: the reader's display-safety rules, held on emit (DEBT-UXM07-004) ─────────────
 * The FE reader (`managerText`, `PARTITION_METRIC_KEY`, `MAX_PARTITION_METRICS`) is STRICTER than the published schema on purpose
 * and refuses the WHOLE read for one offending string. The producer therefore refuses to emit what the reader would refuse, so the
 * failure is a typed 503 here (never a degraded body) and not a silent "unreadable" on every screen. Same sets as the reader
 * (accessEffective / commandCurrency / managerMetric): C0/C1 controls and DEL, zero-width and bidi-control format characters
 * (U+200B..U+200F, U+202A..U+202E, U+2060..U+2064, U+2066..U+2069, U+061C, U+180E, U+FEFF), lone surrogates, whitespace-only. */
const MANAGER_UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const MANAGER_LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export const MANAGER_TEXT_UNSAFE_CODE = "MANAGER_TEXT_UNSAFE";
/** True when `value` may reach a screen as text: none of the characters above, well-formed UTF-16, not whitespace-only. */
export function managerDisplaySafe(value: string): boolean {
  return !MANAGER_UNSAFE_TEXT.test(value) && !MANAGER_LONE_SURROGATE.test(value) && value.trim().length > 0;
}
/**
 * Response-only display-safety: every string a dataset RESPONSE carries must be display-safe. Held here, on the response schema,
 * and NOT on the shared document building blocks: original custody parses the same document schema and must keep accepted source
 * identifier bytes exactly as sent (ELP2-06). Walks the whole body (bounded: depth and node cap) and reports the first unsafe path.
 */
export function validateManagerDisplayText(body: unknown, c: z.RefinementCtx): void {
  let nodes = 0, reported = 0;
  const walk = (value: unknown, path: Array<string | number>, depth: number): void => {
    if (reported >= 8 || depth > 12 || ++nodes > 200_000) return;
    if (typeof value === "string") {
      if (!managerDisplaySafe(value)) { reported++; c.addIssue({ code: z.ZodIssueCode.custom, path, message: MANAGER_TEXT_UNSAFE_CODE }); }
    } else if (Array.isArray(value)) value.forEach((entry, i) => walk(entry, [...path, i], depth + 1));
    else if (value !== null && typeof value === "object")
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) walk(entry, [...path, key], depth + 1);
  };
  walk(body, [], 0);
}
/** A partition metric key is a lower-case token (`__proto__` cannot reach a map) and a partition holds at most 64 metrics. */
export const MANAGER_PARTITION_METRIC_KEY = /^[a-z][a-z0-9_]{0,63}$/;
export const MANAGER_MAX_PARTITION_METRICS = 64;

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
      // MD-S4: the reader keys a map by the metric key and bounds a partition at 64 metrics.
      if (Object.keys(entry.metrics).length > MANAGER_MAX_PARTITION_METRICS) issue([...path, i, "metrics"], "MANAGER_PARTITION_METRICS_OVER_BOUND");
      for (const key of Object.keys(entry.metrics))
        if (!MANAGER_PARTITION_METRIC_KEY.test(key)) issue([...path, i, "metrics", key], "MANAGER_PARTITION_METRIC_KEY_INVALID");
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
