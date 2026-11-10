/**
 * V2 manager reader, part 1: the primitives and the `ManagerMetric` envelope
 * (`execution-manager-models.openapi.json`, `components/schemas/ManagerMetric`,
 * the `window` object, and the economic partition).
 *
 * Boundary rules (consumer-review-2026-10-18, review2/04 and 06):
 * - the body is `unknown` until every check passes; one bad metric voids the
 *   read of the metric that carries it (and, in `managerDataset.ts`, of the
 *   dataset that carries that metric). There is no partial trust;
 * - a metric value is an exact decimal STRING and stays one. A JS number, an
 *   exponent, a leading zero, `NaN` and a negative zero are refused. The reader
 *   never rounds, never sums, never divides: `denominator` is carried as the
 *   source's string and is not used;
 * - `null` is an absence with a reason, never `0`. A published `"0"` is a value
 *   (`zero: true`), a different fact from a metric that says nothing;
 * - availability is closed. Only `AVAILABLE` carries a value. `PARTIAL`,
 *   `UNAVAILABLE` and `NOT_APPLICABLE` carry none and name a reason, so a
 *   `PARTIAL` metric here is an ABSENCE (unlike `boundary.readMetric`, whose
 *   PARTIAL has a number): the manager contract publishes no figure for it;
 * - `caveats` restate published fields (no methodology, not complete, not
 *   fresh, not verified); the reader invents no policy, but it never lets an
 *   AVAILABLE value look cleaner than the metric says it is;
 * - the contract is closed: a key the schema does not name voids the read.
 */
import type { ExactUnit } from "../../formatExact";
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { readDecimal, type BoundaryDecimal } from "../boundary";

export const MANAGER_AVAILABILITIES = ["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_APPLICABLE"] as const;
export type ManagerAvailability = (typeof MANAGER_AVAILABILITIES)[number];
export const MANAGER_COMPLETENESS = ["COMPLETE", "PARTIAL", "UNRESOLVED"] as const;
export type ManagerCompleteness = (typeof MANAGER_COMPLETENESS)[number];
export const MANAGER_FRESHNESS = ["FRESH", "STALE", "UNKNOWN"] as const;
export type ManagerFreshness = (typeof MANAGER_FRESHNESS)[number];
export const MANAGER_SOURCE_CONFIDENCE = ["VERIFIED", "PROVISIONAL", "UNKNOWN"] as const;
export type ManagerSourceConfidence = (typeof MANAGER_SOURCE_CONFIDENCE)[number];
export const MANAGER_ECONOMIC_DOMAINS = ["ACTUAL", "PAPER", "SANDBOX"] as const;
export type ManagerEconomicDomain = (typeof MANAGER_ECONOMIC_DOMAINS)[number];

/** `ManagerMetric.quality.reasons` maxItems. (The dataset's own quality allows 32.) */
export const MAX_METRIC_REASONS = 64;
/** `ManagerMetric.provenance_refs` minItems 1, maxItems 32. */
export const MAX_PROVENANCE_REFS = 32;
/** Schema `maxLength` of every bounded text. */
export const MAX_TEXT = 256;
/** Schema `maxLength` of a decimal string. */
export const MAX_DECIMAL = 128;
/**
 * The most metrics one partition may carry. The schema has no `maxProperties` there: this is a reader-side bound (seven
 * metric keys exist; 64 leaves room for a key Codex adds before this build knows it).
 */
export const MAX_PARTITION_METRICS = 64;
/** Schema `economic_partitions` / `capital_statements` maxItems. */
export const MAX_PARTITIONS = 200;

/* ───────────────────────── primitives ───────────────────────── */

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** The contract is closed (`additionalProperties: false`): a key the schema does not name voids the read. */
export function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

/** Every key the schema requires is an own property (a `null` is a value; an absent key is not). */
export function hasAll(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

/**
 * Characters text must not contain: C0/C1 controls and DEL (the schema forbids C0 and DEL), and, STRICTER THAN THE SCHEMA,
 * zero-width and bidi-control format characters (U+200B..U+200F, U+202A..U+202E, U+2060..U+2064, U+2066..U+2069, U+061C,
 * U+180E, U+FEFF): they can reverse or hide the text around them. Same set as accessEffective / commandCurrency.
 */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/**
 * Bounded printable text: 1..`max` code points (the schema's minLength 1 / maxLength 256), no C0/C1/DEL, none of the invisible
 * format characters, well-formed UTF-16, not whitespace-only. The last three are STRICTER THAN THE SCHEMA (named in the
 * conformance suite as MD-S1: display safety).
 */
export function managerText(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > max * 2) return null;
  if (UNSAFE_TEXT.test(value) || LONE_SURROGATE.test(value) || value.trim().length === 0) return null;
  return codePoints(value) <= max ? value : null;
}

export function nullableText(value: unknown, max = MAX_TEXT): string | null | undefined {
  return value === null ? null : managerText(value, max) ?? undefined;
}

/** Schema `integer`, minimum 0, maximum 2^53-1; STRICTER THAN THE SCHEMA the reader keeps it inside the Date range (readUtcEpochMs; MD-S12). */
export function clockMs(value: unknown): UtcEpochMs | null {
  return typeof value === "number" && value >= 0 ? readUtcEpochMs(value) : null;
}

/** Schema `integer`, minimum 0, maximum `max`. */
export function boundedCount(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
}

const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const NEGATIVE_ZERO = /^-0+(\.0+)?$/;
const ZERO = /^0+(\.0+)?$/;

export interface ExactValue {
  /** The source's decimal string, untouched. */
  exact: string;
  /** True only when the exact string is zero (a published zero, not an absence). */
  zero: boolean;
}

/**
 * Exact decimal string: the schema's `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`, at most 128 characters, and STRICTER THAN THE
 * SCHEMA a negative zero (`-0`, `-0.00`) is refused (MD-S2): it is a signed nothing. A JS number never gets here.
 */
export function exactValue(value: unknown): ExactValue | null {
  if (typeof value !== "string" || value.length > MAX_DECIMAL || !DECIMAL.test(value) || NEGATIVE_ZERO.test(value)) return null;
  return { exact: value, zero: ZERO.test(value) };
}

export interface MsWindow { fromMs: UtcEpochMs; toMs: UtcEpochMs }

/** `{from_ms, to_ms}`: both schema integers; STRICTER THAN THE SCHEMA the window is not backwards (MD-S3). */
export function readMsWindow(raw: unknown): MsWindow | null {
  const window = record(raw);
  if (window === null || !hasOnly(window, ["from_ms", "to_ms"]) || !hasAll(window, ["from_ms", "to_ms"])) return null;
  const fromMs = clockMs(window.from_ms);
  const toMs = clockMs(window.to_ms);
  return fromMs === null || toMs === null || fromMs > toMs ? null : { fromMs, toMs };
}

/* ───────────────────────── the metric envelope ───────────────────────── */

export type ManagerCaveat = "NO_METHODOLOGY" | "INCOMPLETE" | "NOT_FRESH" | "NOT_VERIFIED";

export interface ManagerQuality {
  completeness: ManagerCompleteness;
  freshness: ManagerFreshness;
  reasons: readonly string[];
}

interface MetricBase {
  /** Free text as published (`MONEY`, `SCORE`, `NOT_PUBLISHED`, ...). Not an enum in the schema. */
  unit: string;
  /** Required (non-null) when `unit` is `MONEY`. */
  currency: string | null;
  basis: string;
  /** `null` is "the source states no window", not "all time". */
  window: MsWindow | null;
  /** The source's exact string; carried, never used to compute. */
  denominator: string | null;
  /** `null` is "no methodology published". */
  methodologyRef: string | null;
  quality: ManagerQuality;
  sourceConfidence: ManagerSourceConfidence;
  provenanceRefs: readonly string[];
  calculationRevision: string;
  policyRevision: string;
  /** The UTC time this figure took effect (a funding or return receipt, a budget approval, an allocation), when the source publishes one. `null` is "not published", never inferred. */
  effectiveAtMs: UtcEpochMs | null;
}

export interface ManagerMetricValue extends MetricBase {
  kind: "value";
  availability: "AVAILABLE";
  exact: string;
  /** The source published an exact zero; not the same as publishing nothing. */
  zero: boolean;
  /** An AVAILABLE metric may still name a reason (the schema allows it); carried as published. */
  reasonCode: string | null;
  /** Published facts that make the value less than clean; empty means every flag is as good as it gets. */
  caveats: readonly ManagerCaveat[];
}

export interface ManagerMetricAbsent extends MetricBase {
  kind: "absent";
  availability: Exclude<ManagerAvailability, "AVAILABLE">;
  reasonCode: string;
  /** Fixed state word plus the published code, e.g. `Not available · METHODOLOGY_NOT_PUBLISHED`. */
  copy: string;
}

export type ManagerMetricRead = ManagerMetricValue | ManagerMetricAbsent;

const ABSENT_WORD: Readonly<Record<Exclude<ManagerAvailability, "AVAILABLE">, string>> = {
  PARTIAL: "Partial, no figure published",
  UNAVAILABLE: "Not available",
  NOT_APPLICABLE: "Not applicable",
};

const METRIC_KEYS = [
  "value", "unit", "currency", "basis", "window", "denominator", "methodology_ref", "availability", "reason_code", "quality",
  "source_confidence", "provenance_refs", "calculation_revision", "policy_revision",
] as const;
/** Optional keys of the metric: absent is allowed, present must be valid (additive since UXM-07 WP-2). */
const METRIC_OPTIONAL_KEYS = ["effective_at_ms"] as const;

/** The dataset's own `quality` (reasons maxItems 32) and the metric's (64) are the same shape. */
export function readManagerQuality(raw: unknown, maxReasons: number): ManagerQuality | null {
  const quality = record(raw);
  if (quality === null || !hasOnly(quality, ["completeness", "freshness", "reasons"]) || !hasAll(quality, ["completeness", "freshness", "reasons"])) return null;
  const completeness = oneOf(quality.completeness, MANAGER_COMPLETENESS);
  const freshness = oneOf(quality.freshness, MANAGER_FRESHNESS);
  if (completeness === null || freshness === null || !Array.isArray(quality.reasons) || quality.reasons.length > maxReasons) return null;
  const reasons: string[] = [];
  for (const entry of quality.reasons) {
    const reason = managerText(entry);
    if (reason === null) return null;
    reasons.push(reason);
  }
  return { completeness, freshness, reasons };
}

/**
 * `ManagerMetric` -> typed read, or `null` for a body that is not this contract (malformed: render unavailable, never `0`).
 *
 * Cross-field rules of the schema (`allOf`): AVAILABLE has a value; anything else has none and a reason; `MONEY` has a
 * currency. Not a rule of the schema but kept: the decimal grammar of `denominator`, an unsafe-text refusal, and
 * `from_ms <= to_ms` in the window.
 */
export function readManagerMetric(raw: unknown): ManagerMetricRead | null {
  const metric = record(raw);
  if (metric === null || !hasOnly(metric, [...METRIC_KEYS, ...METRIC_OPTIONAL_KEYS]) || !hasAll(metric, METRIC_KEYS)) return null;
  // Schema `effective_at_ms`: optional UTC-ms integer. Present and invalid (a string, a fraction, a negative, null) voids the metric.
  const effectiveAtMs = Object.prototype.hasOwnProperty.call(metric, "effective_at_ms") ? clockMs(metric.effective_at_ms) : null;
  if (Object.prototype.hasOwnProperty.call(metric, "effective_at_ms") && (effectiveAtMs === null || !Number.isSafeInteger(metric.effective_at_ms))) return null;

  const availability = oneOf(metric.availability, MANAGER_AVAILABILITIES);
  const unit = managerText(metric.unit);
  const currency = nullableText(metric.currency);
  const basis = managerText(metric.basis);
  const window = metric.window === null ? null : readMsWindow(metric.window);
  const denominator = metric.denominator === null ? null : exactValue(metric.denominator);
  const methodologyRef = nullableText(metric.methodology_ref);
  const reasonCode = nullableText(metric.reason_code);
  const quality = readManagerQuality(metric.quality, MAX_METRIC_REASONS);
  const confidence = oneOf(metric.source_confidence, MANAGER_SOURCE_CONFIDENCE);
  const calculationRevision = managerText(metric.calculation_revision);
  const policyRevision = managerText(metric.policy_revision);
  if (
    availability === null || unit === null || currency === undefined || basis === null || (metric.window !== null && window === null)
    || (metric.denominator !== null && denominator === null) || methodologyRef === undefined || reasonCode === undefined
    || quality === null || confidence === null || calculationRevision === null || policyRevision === null
  ) return null;

  const refs = metric.provenance_refs;
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > MAX_PROVENANCE_REFS) return null;
  const provenanceRefs: string[] = [];
  for (const entry of refs) {
    const ref = managerText(entry);
    if (ref === null) return null;
    provenanceRefs.push(ref);
  }

  // `MONEY` needs the currency it is in; a bare money figure would be a number with no unit.
  if (unit === "MONEY" && currency === null) return null;

  const base: MetricBase = {
    unit, currency, basis, window, denominator: denominator === null ? null : denominator.exact, methodologyRef, quality,
    sourceConfidence: confidence, provenanceRefs, calculationRevision, policyRevision, effectiveAtMs,
  };

  if (availability === "AVAILABLE") {
    const value = exactValue(metric.value);
    if (value === null) return null;
    const caveats: ManagerCaveat[] = [];
    if (methodologyRef === null) caveats.push("NO_METHODOLOGY");
    if (quality.completeness !== "COMPLETE") caveats.push("INCOMPLETE");
    if (quality.freshness !== "FRESH") caveats.push("NOT_FRESH");
    if (confidence !== "VERIFIED") caveats.push("NOT_VERIFIED");
    return { kind: "value", availability, ...base, exact: value.exact, zero: value.zero, reasonCode, caveats };
  }

  // Not AVAILABLE: no value, and the reason is mandatory (a metric that says nothing must say why).
  if (metric.value !== null || reasonCode === null) return null;
  return { kind: "absent", availability, ...base, reasonCode, copy: `${ABSENT_WORD[availability]} · ${reasonCode}` };
}

/**
 * A value read as the shared exact-decimal display (`formatExact`). The unit class is the SCREEN's choice (`money` for
 * `MONEY`, `pct` for a percentage, ...); the reader does not map the free-text `unit` to one. `null` for a value the
 * boundary refuses, so a caller cannot print a figure the boundary would not.
 */
export function managerMetricDecimal(metric: ManagerMetricValue, unit: ExactUnit, dp?: number): BoundaryDecimal | null {
  const decimal = readDecimal(metric.exact, dp === undefined ? { unit } : { unit, dp });
  // `formatExact` must keep the server's exact original; if it ever did not, the figure is not shown.
  return decimal !== null && decimal.full === metric.exact ? decimal : null;
}

/* ───────────────────────── the economic partition ───────────────────────── */

export interface ManagerPartition {
  economicDomain: ManagerEconomicDomain;
  /** The unit every MONEY metric inside this partition is in. Never merged with another partition's. */
  currency: string;
  basis: string;
  nativeProfileRef: string;
  domainProofRef: string;
}

const PARTITION_KEYS = ["economic_domain", "currency", "basis", "native_profile_ref", "domain_proof_ref"] as const;
const PARTITION_METRIC_KEY = /^[a-z][a-z0-9_]{0,63}$/;

export function readManagerPartition(raw: unknown): ManagerPartition | null {
  const partition = record(raw);
  if (partition === null || !hasOnly(partition, PARTITION_KEYS) || !hasAll(partition, PARTITION_KEYS)) return null;
  const economicDomain = oneOf(partition.economic_domain, MANAGER_ECONOMIC_DOMAINS);
  const currency = managerText(partition.currency);
  const basis = managerText(partition.basis);
  const nativeProfileRef = managerText(partition.native_profile_ref);
  const domainProofRef = managerText(partition.domain_proof_ref);
  if (economicDomain === null || currency === null || basis === null || nativeProfileRef === null || domainProofRef === null) return null;
  return { economicDomain, currency, basis, nativeProfileRef, domainProofRef };
}

/** One partition and the metrics published inside it. A key the partition does not publish is absent from the map: not zero. */
export interface ManagerPartitionedMetrics {
  partition: ManagerPartition;
  metrics: ReadonlyMap<string, ManagerMetricRead>;
}

/**
 * The identity of a partition is FOUR fields; `domain_proof_ref` is evidence, not identity (BE-P1: the producer's
 * `partitionIdentity`, same as `managerPartitionKey`). A repeat that differs only in its proof reference is still a repeat.
 */
const partitionIdentity = (partition: ManagerPartition): string => JSON.stringify([
  partition.economicDomain, partition.currency, partition.basis, partition.nativeProfileRef,
]);

/**
 * A list of `{partition, metrics}` (a row's `economic_partitions`, a group's, or the dataset's `capital_statements`).
 *
 * The schema gives the shape; four rules are the reader's (all STRICTER THAN THE SCHEMA, named in the conformance suite):
 * - MD-S4: a metric key is a lower-case token (the schema says any string; a key like `__proto__` cannot reach a map)
 *   and a partition holds at most `MAX_PARTITION_METRICS` metrics;
 * - MD-S6: a partition appears once (identity = domain, currency, basis, native_profile_ref; the proof reference is evidence):
 *   two entries with the same identity would be summed twice by anyone who sums;
 * - MD-S6: a metric that names a currency names the partition's: a USDT partition holding a EUR figure is a cross-currency mix.
 * There is no total anywhere in the output; partitions are published in order and stay separate.
 */
export function readPartitionedMetricsList(raw: unknown): readonly ManagerPartitionedMetrics[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PARTITIONS) return null;
  const out: ManagerPartitionedMetrics[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const item = record(entry);
    if (item === null || !hasOnly(item, ["partition", "metrics"]) || !hasAll(item, ["partition", "metrics"])) return null;
    const partition = readManagerPartition(item.partition);
    const bag = record(item.metrics);
    if (partition === null || bag === null) return null;
    const identity = partitionIdentity(partition);
    if (seen.has(identity)) return null;
    seen.add(identity);
    const keys = Object.keys(bag);
    if (keys.length > MAX_PARTITION_METRICS) return null;
    const metrics = new Map<string, ManagerMetricRead>();
    for (const key of keys) {
      const metric = PARTITION_METRIC_KEY.test(key) ? readManagerMetric(bag[key]) : null;
      if (metric === null || (metric.currency !== null && metric.currency !== partition.currency)) return null;
      metrics.set(key, metric);
    }
    out.push({ partition, metrics });
  }
  return out;
}

/**
 * The figures of ONE metric key, one entry per partition, in published order. `metric: null` is "this partition publishes
 * no such metric" (not zero). There is deliberately no sum: a total over these entries would mix currencies and domains.
 */
export function figuresByPartition(
  list: readonly ManagerPartitionedMetrics[],
  key: string,
): readonly { partition: ManagerPartition; metric: ManagerMetricRead | null }[] {
  return list.map((entry) => ({ partition: entry.partition, metric: entry.metrics.get(key) ?? null }));
}
