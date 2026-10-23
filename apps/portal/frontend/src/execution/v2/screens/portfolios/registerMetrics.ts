/**
 * What the Portfolios register reads from the Manager dataset's portfolio groups, as pure functions (no React).
 *
 * - A figure is one exact string published inside ONE economic partition of a group (`group_by=portfolio_id`). A portfolio with
 *   several partitions has no single figure until a currency is picked: sorting and range filters read the partition the page
 *   currency names (or the only partition there is) and treat anything else as "no figure" (null-last, never 0, never summed).
 * - The PORTFOLIO SCORE is published, not computed: `portfolio_score` (direct from the portfolio NAV, F = 0.45P + 0.30R + 0.25B),
 *   its `_p`, `_r`, `_b` components and `_evidence` coverage are open metric keys of a group partition. The band is the spec's
 *   band table (SCORE_REGIME_SPECIFICATION v1.1, 11.2) applied to the published exact value by exact decimal comparison; it is a
 *   label for the value, not a second score. `source_confidence` PROVISIONAL is the "provisional" badge; `policy_revision` and
 *   `methodology_ref` are printed as published.
 * - HHI (`concentration_hhi`) is a separate diagnostic: it never feeds the score and has no band.
 * Nothing here parses a number: values are compared with `compareDecimal` (BigInt on the digits), never as floats.
 */
import { compareDecimal } from "../../charts/decimal";
import type { ManagerMetricRead, ManagerMetricValue, ManagerPartitionedMetrics } from "../../readers/managerMetric";

export const SCORE_KEYS = {
  score: "portfolio_score",
  p: "portfolio_score_p",
  r: "portfolio_score_r",
  b: "portfolio_score_b",
  evidence: "portfolio_score_evidence",
} as const;

/* ── bands ─────────────────────────────────────────────────────────────── */

export type ScoreBand = "weak" | "neutral" | "fair" | "good" | "very_good";

export const BAND_LABEL: Readonly<Record<ScoreBand, string>> = {
  weak: "Weak",
  neutral: "Neutral",
  fair: "Fair",
  good: "Good",
  very_good: "Very good",
};

/** Lower edge (inclusive) of each band above weak, from the canonical unrounded value: [0,40) [40,60) [60,75) [75,90) [90,100]. */
const BAND_EDGES: readonly (readonly [ScoreBand, string])[] = [["very_good", "90"], ["good", "75"], ["fair", "60"], ["neutral", "40"]];

export function bandOf(exact: string): ScoreBand {
  for (const [band, edge] of BAND_EDGES) if (compareDecimal(exact, edge) >= 0) return band;
  return "weak";
}

/**
 * The value as printed: truncated (toward zero, never rounded) to two places, so a score below an edge never prints as the edge
 * (74.999 is Fair and reads 74.99, not 75.00). The exact published string stays on the title.
 */
export function truncateDecimal(exact: string, places = 2): string {
  const negative = exact.startsWith("-");
  const [whole, fraction = ""] = (negative ? exact.slice(1) : exact).split(".");
  const kept = fraction.slice(0, places).padEnd(places, "0");
  const out = places === 0 ? whole! : `${whole}.${kept}`;
  return negative && /[1-9]/.test(out) ? `-${out}` : out;
}

/* ── partition choice ──────────────────────────────────────────────────── */

export type Group = readonly ManagerPartitionedMetrics[];

/**
 * The one partition a sort or a range filter reads: the partition in the page currency, or the only partition of the group.
 * `null` for no partition or for several (a currency must be picked); the caller then says "no single figure", it never guesses.
 */
export function pickPartition(group: Group | undefined, currency: string | null): ManagerPartitionedMetrics | null {
  if (group === undefined) return null;
  const candidates = currency === null ? group : group.filter((entry) => entry.partition.currency === currency);
  return candidates.length === 1 ? candidates[0]! : null;
}

const published = (metric: ManagerMetricRead | undefined): ManagerMetricValue | null => (metric !== undefined && metric.kind === "value" ? metric : null);

/** The exact string a group publishes for `key` in the chosen partition, or `null`. */
export function measureValue(group: Group | undefined, key: string, currency: string | null): string | null {
  return published(pickPartition(group, currency)?.metrics.get(key))?.exact ?? null;
}

/* ── the score of one partition ────────────────────────────────────────── */

export type ScoreRead =
  | { kind: "none"; reason: string }
  | { kind: "absent"; code: string; reason: string; evidence: string | null; policy: string }
  | {
      kind: "value";
      exact: string;
      band: ScoreBand;
      provisional: boolean;
      policy: string;
      methodology: string | null;
      evidence: string | null;
      p: string | null;
      r: string | null;
      b: string | null;
      window: string | null;
    };

const exactOf = (metric: ManagerMetricRead | undefined): string | null => published(metric)?.exact ?? null;

/** The score of one partition entry, from the keys it publishes. A partition that publishes no `portfolio_score` is `none`. */
export function scoreOfEntry(entry: ManagerPartitionedMetrics): ScoreRead {
  const metric = entry.metrics.get(SCORE_KEYS.score);
  if (metric === undefined) return { kind: "none", reason: "This partition publishes no portfolio score." };
  const evidence = exactOf(entry.metrics.get(SCORE_KEYS.evidence));
  if (metric.kind === "absent") return { kind: "absent", code: metric.reasonCode, reason: metric.copy, evidence, policy: metric.policyRevision };
  const window = metric.window === null ? null : `${new Date(metric.window.fromMs).toISOString().slice(0, 10)} to ${new Date(metric.window.toMs).toISOString().slice(0, 10)} (UTC)`;
  return {
    kind: "value",
    exact: metric.exact,
    band: bandOf(metric.exact),
    provisional: metric.sourceConfidence === "PROVISIONAL",
    policy: metric.policyRevision,
    methodology: metric.methodologyRef,
    evidence,
    p: exactOf(entry.metrics.get(SCORE_KEYS.p)),
    r: exactOf(entry.metrics.get(SCORE_KEYS.r)),
    b: exactOf(entry.metrics.get(SCORE_KEYS.b)),
    window,
  };
}

/** The score a sort or filter reads: one partition (see `pickPartition`), else `none`. */
export function scoreOf(group: Group | undefined, currency: string | null): ScoreRead {
  if (group === undefined) return { kind: "none", reason: "No figures are published for this portfolio." };
  const entry = pickPartition(group, currency);
  if (entry === null) return { kind: "none", reason: group.length === 0 ? "No economic partition is published." : "Several economic partitions: pick a currency." };
  return scoreOfEntry(entry);
}

/** "Missing or insufficient evidence": there is no published score value for the portfolio. */
export const scoreMissing = (group: Group | undefined, currency: string | null): boolean => scoreOf(group, currency).kind !== "value";

/** Evidence coverage 0..1 as a percent, truncated to a whole number, from the exact string (`0.9712` is 97%). */
export function evidencePercent(exact: string): string {
  const negative = exact.startsWith("-");
  const [whole, fraction = ""] = (negative ? exact.slice(1) : exact).split(".");
  if (negative || !/^\d+$/.test(whole!)) return exact;
  const digits = `${whole}${fraction.padEnd(2, "0").slice(0, 2)}`; // hundredths of the ratio = whole percent
  return `${BigInt(digits)}%`;
}

/* ── range filters ─────────────────────────────────────────────────────── */

export const RANGE_IDS = ["pnl", "ret", "dd", "score", "alloc"] as const;
export type RangeId = (typeof RANGE_IDS)[number];

export interface RangeSpec {
  id: RangeId;
  param: string;
  label: string;
  /** What the operands are in, said next to the inputs. */
  unit: "money" | "percent" | "points";
  /** Where the value comes from. */
  source: "group" | "allocated";
  key: string | null;
}

export const RANGES: readonly RangeSpec[] = [
  { id: "pnl", param: "f_pnl", label: "Net PnL", unit: "money", source: "group", key: "net_pnl" },
  { id: "ret", param: "f_ret", label: "Return", unit: "percent", source: "group", key: "return_30d_pct" },
  { id: "dd", param: "f_dd", label: "Drawdown", unit: "percent", source: "group", key: "max_drawdown_pct" },
  { id: "score", param: "f_score", label: "Score", unit: "points", source: "group", key: SCORE_KEYS.score },
  { id: "alloc", param: "f_alloc", label: "Allocated capital", unit: "money", source: "allocated", key: null },
];

export const SCORE_STATE_PARAM = "score_state";
export const SCORE_MISSING = "missing";

export interface Range {
  min: string | null;
  max: string | null;
}

const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
export const isDecimal = (text: string): boolean => text.length <= 40 && DECIMAL.test(text);

/** `min..max`, either side may be empty (`..5`, `-2..`). A value that is not a decimal, or a min above the max, is not a range. */
export function parseRange(raw: string | null): Range | null {
  if (raw === null) return null;
  const at = raw.indexOf("..");
  if (at < 0) return null;
  const min = raw.slice(0, at);
  const max = raw.slice(at + 2);
  if ((min !== "" && !isDecimal(min)) || (max !== "" && !isDecimal(max))) return null;
  if (min === "" && max === "") return null;
  if (min !== "" && max !== "" && compareDecimal(min, max) > 0) return null;
  return { min: min === "" ? null : min, max: max === "" ? null : max };
}

export const writeRange = (range: Range): string => `${range.min ?? ""}..${range.max ?? ""}`;

/** Inclusive on both ends. A portfolio with no figure is outside every range. */
export function inRange(value: string | null, range: Range): boolean {
  if (value === null) return false;
  if (range.min !== null && compareDecimal(value, range.min) < 0) return false;
  if (range.max !== null && compareDecimal(value, range.max) > 0) return false;
  return true;
}

/** The wording of one filter, for its chip and its field note. */
export function rangeText(spec: RangeSpec, range: Range, currency: string | null): string {
  const unit = spec.unit === "money" ? ` ${currency ?? ""}`.trimEnd() : spec.unit === "percent" ? "%" : " pts";
  const lo = range.min === null ? null : `≥ ${range.min}${unit}`;
  const hi = range.max === null ? null : `≤ ${range.max}${unit}`;
  return `${spec.label} ${[lo, hi].filter((part) => part !== null).join(" and ")}`;
}
