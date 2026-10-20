/**
 * BE-P4 / FE-013: the STORED form of a Manager time series (NAV, Net PnL,
 * Return) for one subject, one economic partition and one exact window.
 *
 * It is a source fact the Portal selects, never one it computes. Nothing in
 * the repository writes it today: the financial normalized source that would
 * supply it is MISSING (see the BE-CLAUDE-2026-10-20 BE-P4 ledger), so a
 * profile's `precomputed_series` is absent and every read says so. This file
 * exists so the day a producer publishes one, the only way to be served is to
 * satisfy every rule below; it deliberately imports nothing from
 * `manager-model.contract` (which embeds this schema in the document input).
 *
 * Rules that make a series trustworthy rather than merely present:
 *  - exact decimal strings only, never a JS number;
 *  - a series is in ONE currency/basis/unit and carries its `methodology_ref`
 *    and exact `window`; a NAV in USDT is never mixed with VND, rebased,
 *    interpolated or carried forward across a gap;
 *  - points are strictly ascending, inside the window and not later than the
 *    source cutoff; gaps are stated, not filled;
 *  - a series with values must come from a SOURCE_VERIFIED document (TEST_ONLY
 *    documents can only be read through pure components, never served).
 */
import { z } from "zod";
import { executionEnvironment, exactDecimal, financialStage, utcMilliseconds } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";

const text = z.string().min(1).max(256);
export const MAX_SERIES_POINTS = 2000;
export const MAX_SERIES_GAPS = 256;
export const seriesMetric = z.enum(["NAV", "NET_PNL", "RETURN"]);
export type SeriesMetric = z.infer<typeof seriesMetric>;
/** Field-policy name each metric is read under (BUSINESS_READ_FIELDS). */
export const SERIES_METRIC_FIELD: Record<SeriesMetric, string> = { NAV: "current_nav", NET_PNL: "net_pnl", RETURN: "return" };
/** Same five keys as `managerPartition`; kept local so this file stays import-cycle free (a test pins equality). */
export const seriesPartition = z.object({ economic_domain: z.enum(["ACTUAL", "PAPER", "SANDBOX"]), currency: text, basis: text,
  native_profile_ref: text, domain_proof_ref: text }).strict();
export const seriesUnit = z.enum(["MONEY", "RATIO"]);
export const seriesPoint = z.object({ ts_ms: utcMilliseconds, value: exactDecimal }).strict();
export const seriesGap = z.object({ from_ms: utcMilliseconds, to_ms: utcMilliseconds,
  reason: z.enum(["SOURCE_GAP", "RETENTION", "SESSION_CLOSED", "PROJECTION_DISCONTINUITY"]) }).strict();
export const seriesWindow = z.object({ from_ms: utcMilliseconds, to_ms: utcMilliseconds }).strict();
export const seriesQuality = z.object({ completeness: z.enum(["COMPLETE", "PARTIAL", "UNRESOLVED"]),
  freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]), reasons: z.array(text).max(32) }).strict();
export const seriesConfidence = z.enum(["VERIFIED", "PROVISIONAL", "UNKNOWN"]);

export interface SeriesBody { unit: z.infer<typeof seriesUnit>; currency: string | null; basis: string; methodology_ref: string;
  window: { from_ms: number; to_ms: number }; points: Array<{ ts_ms: number; value: string }>;
  gaps: Array<{ from_ms: number; to_ms: number; reason: string }>; partition: z.infer<typeof seriesPartition>; metric: SeriesMetric }

/** Rules shared by the stored publication and the served entry. Returns issue codes. */
export function seriesBodyIssues(b: SeriesBody, cutoffMs: number | null): string[] {
  const issues: string[] = [];
  if (b.window.from_ms >= b.window.to_ms) issues.push("MANAGER_SERIES_WINDOW_INVALID");
  if (b.metric === "RETURN" ? b.unit !== "RATIO" || b.currency !== null :
    b.unit !== "MONEY" || b.currency === null || b.currency !== b.partition.currency)
    issues.push("MANAGER_SERIES_UNIT_CURRENCY_INVALID");
  if (b.basis !== b.partition.basis) issues.push("MANAGER_SERIES_BASIS_MISMATCH");
  let previous = -1;
  for (const point of b.points) {
    if (point.ts_ms <= previous) { issues.push("MANAGER_SERIES_POINTS_NOT_ASCENDING"); break; }
    previous = point.ts_ms;
  }
  if (b.points.some(p => p.ts_ms < b.window.from_ms || p.ts_ms > b.window.to_ms || cutoffMs !== null && p.ts_ms > cutoffMs))
    issues.push("MANAGER_SERIES_POINT_OUTSIDE_WINDOW");
  let end = -1;
  for (const gap of b.gaps) {
    if (gap.from_ms > gap.to_ms || gap.from_ms < b.window.from_ms || gap.to_ms > b.window.to_ms || gap.from_ms <= end) {
      issues.push("MANAGER_SERIES_GAP_INVALID"); break;
    }
    end = gap.to_ms;
  }
  return issues;
}

export const managerSeriesBinding = z.object({
  subject_type: z.enum(["portfolio", "manager_book"]), subject_id: text,
  tuple_population_digest: publicationDigest, stage_filter: z.array(financialStage).min(1).max(4),
  metric: seriesMetric, partition: seriesPartition, window_start_ms: utcMilliseconds, window_end_ms: utcMilliseconds,
}).strict();
/** A result produced off request by the financial normalized pipeline; never a request body. */
export const managerSeriesPublication = z.object({
  binding: managerSeriesBinding,
  series: z.object({ unit: seriesUnit, currency: text.nullable(), basis: text, methodology_ref: text,
    points: z.array(seriesPoint).max(MAX_SERIES_POINTS), gaps: z.array(seriesGap).max(MAX_SERIES_GAPS) }).strict(),
  quality: seriesQuality, source_confidence: seriesConfidence,
  provenance: z.object({ scope: z.object({ workspace_id: text, environment: executionEnvironment, profile_id: text,
    catalogue_digest: publicationDigest }).strict(), source_revision: text, source_set_digest: publicationDigest,
  source_qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]), input_digest: publicationDigest,
  calculation_revision: text, policy_revision: text, source_as_of_ms: utcMilliseconds }).strict(),
}).strict().superRefine((p, c) => {
  const b = p.binding;
  const issues = seriesBodyIssues({ ...p.series, window: { from_ms: b.window_start_ms, to_ms: b.window_end_ms },
    partition: b.partition, metric: b.metric }, p.provenance.source_as_of_ms);
  if (b.window_end_ms > p.provenance.source_as_of_ms) issues.push("MANAGER_SERIES_WINDOW_AFTER_CUTOFF");
  if (p.series.points.length && p.provenance.source_qualification !== "SOURCE_VERIFIED") issues.push("MANAGER_SERIES_SOURCE_NOT_QUALIFIED");
  if (p.series.points.length && p.quality.completeness === "UNRESOLVED") issues.push("MANAGER_SERIES_QUALITY_UNRESOLVED");
  for (const message of issues) c.addIssue({ code: z.ZodIssueCode.custom, message });
});
export type ManagerSeriesPublication = z.infer<typeof managerSeriesPublication>;

/** Allowed financial stages of an environment (same map as the model contract). */
export const seriesStagesFor = (environment: "paper" | "sandbox" | "live"): Array<z.infer<typeof financialStage>> =>
  environment === "paper" ? ["PAPER"] : environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];

/** Document-level rules a lone publication cannot say: it must belong to the document that carries it. */
export function validateManagerSeriesPublications(d: { workspace_id: string; environment: "paper" | "sandbox" | "live"; profile_id: string;
  catalogue_digest: string; revision: string; source_set_digest: string; as_of_ms: number;
  precomputed_series?: ManagerSeriesPublication[] }, c: z.RefinementCtx): void {
  const seen = new Set<string>(), allowed = seriesStagesFor(d.environment);
  (d.precomputed_series ?? []).forEach((s, i) => {
    const bad = (message: string) => c.addIssue({ code: z.ZodIssueCode.custom, path: ["precomputed_series", i], message });
    const p = s.provenance;
    if (p.scope.workspace_id !== d.workspace_id || p.scope.environment !== d.environment || p.scope.profile_id !== d.profile_id ||
      p.scope.catalogue_digest !== d.catalogue_digest || p.source_revision !== d.revision || p.source_set_digest !== d.source_set_digest ||
      p.source_as_of_ms !== d.as_of_ms) bad("MANAGER_SERIES_NOT_BOUND_TO_DOCUMENT");
    if (s.binding.stage_filter.some(stage => !allowed.includes(stage))) bad("MANAGER_SERIES_STAGE_ENVIRONMENT_MISMATCH");
    // The same domain rule the facts obey: a paper document carries PAPER money, a live one ACTUAL, never a borrowed domain.
    if (s.binding.partition.economic_domain !== (d.environment === "live" ? "ACTUAL" : d.environment.toUpperCase())) bad("MANAGER_SERIES_DOMAIN_ENVIRONMENT_MISMATCH");
    const key = JSON.stringify([s.binding.subject_type, s.binding.subject_id, s.binding.metric, s.binding.partition, s.binding.window_start_ms,
      s.binding.window_end_ms, [...s.binding.stage_filter].sort(), s.binding.tuple_population_digest]);
    if (seen.has(key)) bad("MANAGER_SERIES_DUPLICATE_BINDING");
    seen.add(key);
  });
}
