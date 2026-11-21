/**
 * Screen 04 — the all-time monthly strip and daily histogram as the backend now publishes them
 * (`BR_F6_ALL_TIME_DISTRIBUTIONS_2026-10-01.md`).
 *
 * Two sources carry the same facts: the series endpoint (`source_sample.derivation`) and the optional
 * `summary_analytics_v2.distributions` companion. Both are read here into the one Hub-shaped series the
 * panels already draw. Every field is optional because old seals answer without it: an absent field is
 * never read as a claim (no "not partial", no "0 days"), it just draws no marker.
 * Nothing here computes a number: counts, totals and omitted months are the server's, printed as served.
 */

import type { EvidenceSeries, RetainedAnalyticsV2, SeriesKind } from "./evidenceClient";
import { formatMetric, shortDigest } from "./researchFormat";

export type MonthBasis = "FIRST_OOS_CLOSE" | "PREVIOUS_OBSERVED_MONTH_CLOSE";
export type SeriesGrain = "UTC_CALENDAR_MONTH" | "UTC_DAY";

export interface SeriesDerivationRead {
  origin: string | null;
  scope: string | null;
  input_digest: string | null;
  source_locator: string | null;
  definition_id: string | null;
  grain: SeriesGrain | null;
  oos_observation_count: number | null;
  total_period_count: number | null;
  omitted_transport_period_count: number | null;
  /** Companion only: leading months with a single close, which cannot produce a return. */
  omitted_leading_period_count: number | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

/** A served count, which the new histogram sends as a string: a finite non-negative number or `null`, never NaN. */
export function safeCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

/** The series' `source_sample.derivation`, or `null` for a legacy answer that carries none. */
export function derivationOf(series: Pick<EvidenceSeries, "source_sample"> | null | undefined): SeriesDerivationRead | null {
  const raw = (series?.source_sample as { derivation?: unknown } | undefined)?.derivation;
  if (!isObject(raw)) return null;
  const grain = raw.grain === "UTC_CALENDAR_MONTH" || raw.grain === "UTC_DAY" ? raw.grain : null;
  return {
    origin: str(raw.origin),
    scope: str(raw.scope),
    input_digest: str(raw.input_digest),
    source_locator: str(raw.source_locator),
    definition_id: str(raw.definition_id),
    grain,
    oos_observation_count: num(raw.oos_observation_count),
    total_period_count: num(raw.total_period_count),
    omitted_transport_period_count: num(raw.omitted_transport_period_count),
    omitted_leading_period_count: num(raw.omitted_leading_period_count),
  };
}

/** The histogram is the all-time UTC DAILY one when its derivation (or its definition) says so. */
export function isDailyDistribution(series: Pick<EvidenceSeries, "source_sample"> | null | undefined): boolean {
  const d = derivationOf(series);
  return d !== null && (d.grain === "UTC_DAY" || (d.grain === null && (d.definition_id ?? "").includes("DAILY")));
}

const BASIS_WORDS: Record<MonthBasis, string> = {
  FIRST_OOS_CLOSE: "first OOS close",
  PREVIOUS_OBSERVED_MONTH_CLOSE: "previous month close",
};
const DAY = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface MonthFacts {
  partial?: boolean;
  observation_count?: number;
  expected_observation_count?: number;
  basis?: string;
  base_at_utc_ms?: number;
  close_at_utc_ms?: number;
}

/**
 * The coverage words of one month cell's tooltip: " · partial month · 2 observations · first OOS close · 2026-01-30 → 2026-01-31".
 * Empty for a legacy point (no new fields) and for a non-partial month that carries none of them.
 */
export function monthCoverage(point: MonthFacts): string {
  const partial = point.partial === true;
  const hasSpan = typeof point.base_at_utc_ms === "number" && typeof point.close_at_utc_ms === "number";
  const basis = point.basis !== undefined && point.basis in BASIS_WORDS ? BASIS_WORDS[point.basis as MonthBasis] : null;
  if (!partial && !hasSpan && basis === null) return "";
  const parts: string[] = [];
  if (partial) parts.push("partial month");
  const n = safeCount(point.observation_count);
  if (n !== null) {
    const of = safeCount(point.expected_observation_count);
    parts.push(of !== null ? `${formatMetric(n, "count")} of ${formatMetric(of, "count")} observations` : `${formatMetric(n, "count")} ${n === 1 ? "observation" : "observations"}`);
  }
  if (basis !== null) parts.push(basis);
  if (hasSpan) parts.push(`${DAY(point.base_at_utc_ms as number)} → ${DAY(point.close_at_utc_ms as number)}`);
  return parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
}

/** "last 32 of 48 months" when the transport tail was applied; `null` otherwise (never implies older months are zero). */
export function tailDisclosure(series: Pick<EvidenceSeries, "source_sample" | "values">): string | null {
  const d = derivationOf(series);
  const omitted = d?.omitted_transport_period_count ?? 0;
  const tail = (series.source_sample as { sampling?: unknown }).sampling === "TAIL_WINDOW_V1" || omitted > 0;
  if (!tail) return null;
  const shown = formatMetric(series.values.length, "count");
  if (d?.total_period_count != null) return `last ${shown} of ${formatMetric(d.total_period_count, "count")} months`;
  return omitted > 0 ? `last ${shown} months · ${formatMetric(omitted, "count")} earlier` : `last ${shown} months`;
}

/** The provenance tooltip of a derived series: definition, origin, scope, grain, population, digest, omissions. */
export function derivationTitle(series: Pick<EvidenceSeries, "source_sample">): string | null {
  const d = derivationOf(series);
  if (d === null) return null;
  const lines = [
    d.definition_id,
    [d.origin?.toLowerCase().replace(/_/g, "-"), d.scope].filter((part): part is string => part !== null && part !== undefined).join(" · ") || null,
    d.grain !== null ? `grain ${d.grain === "UTC_DAY" ? "UTC day" : "UTC month"}` : null,
    d.oos_observation_count !== null ? `OOS population ${formatMetric(d.oos_observation_count, "count")} observations` : null,
    d.total_period_count !== null ? `${formatMetric(d.total_period_count, "count")} periods in total` : null,
    d.omitted_transport_period_count ? `${formatMetric(d.omitted_transport_period_count, "count")} earlier months not sent` : null,
    d.omitted_leading_period_count ? `${formatMetric(d.omitted_leading_period_count, "count")} leading ${d.omitted_leading_period_count === 1 ? "month" : "months"} with one close, no return` : null,
    d.source_locator,
    d.input_digest !== null ? `input ${shortDigest(d.input_digest)}` : null,
  ];
  return lines.filter((line): line is string => line !== null && line !== "").join("\n");
}

/** The header words of a derived series (<= 8 words), or `null` for a legacy one that keeps today's line. */
export function derivedHeadline(series: Pick<EvidenceSeries, "source_sample" | "values" | "kind">): string | null {
  const d = derivationOf(series);
  if (d === null) return null;
  if (series.kind === "RETURN_DISTRIBUTION") {
    const days = safeCount(series.source_sample.source_observation_count);
    const unit = isDailyDistribution(series) ? "days" : "observations";
    return days === null
      ? `${formatMetric(series.values.length, "count")} bins`
      : `${formatMetric(series.values.length, "count")} bins · ${formatMetric(days, "count")} ${unit}`;
  }
  if (series.kind === "MONTHLY_RETURNS") {
    return tailDisclosure(series) ?? `${formatMetric(series.values.length, "count")} ${series.values.length === 1 ? "month" : "months"}`;
  }
  return null;
}

/* ---------------------------------------------- summary_analytics_v2.distributions */

type Companion = NonNullable<RetainedAnalyticsV2["distributions"]>;

export type CompanionRead =
  | { kind: "series"; series: EvidenceSeries }
  | { kind: "absent"; state: "NOT_APPLICABLE"; reason_code: string | null }
  | null;

/**
 * One panel's answer from the companion: the Hub-shaped series when `AVAILABLE` with values, the typed
 * absence (state and server reason code) when `NOT_APPLICABLE`, and `null` when the companion is not
 * served or says nothing usable (the series endpoint then stays the source).
 */
export function companionRead(v2: RetainedAnalyticsV2 | null | undefined, kind: SeriesKind, runId: string): CompanionRead {
  const c = (v2 as { distributions?: Companion } | null | undefined)?.distributions;
  if (!isObject(c)) return null;
  const monthly = kind === "MONTHLY_RETURNS";
  if (!monthly && kind !== "RETURN_DISTRIBUTION") return null;
  const block = (monthly ? c.monthly_returns : c.return_distribution) as Companion["monthly_returns"] | Companion["return_distribution"] | undefined;
  if (!isObject(block)) return null;
  if (block.state === "NOT_APPLICABLE") {
    return { kind: "absent", state: "NOT_APPLICABLE", reason_code: str(block.reason_code) };
  }
  if (block.state !== "AVAILABLE" || !Array.isArray(block.values) || block.values.length === 0) return null;
  const m = c.monthly_returns;
  const derivation = {
    origin: c.origin,
    scope: c.scope,
    input_digest: c.input_digest,
    source_locator: c.scope_locator,
    definition_id: monthly ? c.monthly_definition : c.distribution_definition,
    grain: monthly ? "UTC_CALENDAR_MONTH" : "UTC_DAY",
    oos_observation_count: c.oos_observation_count,
    ...(monthly ? { total_period_count: m.total_period_count, omitted_transport_period_count: m.omitted_transport_period_count, omitted_leading_period_count: m.omitted_leading_period_count } : {}),
  };
  const series = {
    schema_version: "research.evidence-series.v1",
    run_id: runId,
    revision: null,
    etag: null,
    kind,
    availability: { state: "AVAILABLE", reason_code: null },
    source_sample: {
      source_observation_count: block.source_observation_count,
      emitted_point_count: block.emitted_point_count,
      sampling: block.sampling,
      derivation,
    },
    values: block.values,
  } as unknown as EvidenceSeries;
  return { kind: "series", series };
}
