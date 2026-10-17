/** Closed historical Regime wire contract. Describes retained facts, not
 * operational authority, installed source/configuration or predictive signals. */
import { z } from "zod";
import { financialStage, utcMilliseconds } from "./foundation.contract";
import { managerRegimeDecimal, managerRegimeRef, managerRegimeText } from "./manager-regime-publication.contract";

const opaque = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const reasonCodes = z.array(managerRegimeRef).max(64);
const count = z.number().int().min(0).max(4096);
const evidenceStage = z.enum(["ResearchIS", "ResearchOOS", "ResearchValidation", "Paper", "Sandbox", "Canary", "Live"]);
const unique = (xs: readonly string[]) => new Set(xs).size === xs.length;
const compare = (a: string, b: string): number => {
  // Zod may run an object refinement after a field-level dirty regex/max
  // issue. Do not turn malformed decimals into a native BigInt exception.
  const valid = (s: string) => s.length <= 512 && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/.test(s);
  if (!valid(a) || !valid(b)) return Number.NaN;
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const integer = (s: string) => { const negative = s.startsWith("-");
    const [whole, fraction = ""] = (negative ? s.slice(1) : s).split(".");
    return BigInt(whole + fraction.padEnd(scale, "0")) * (negative ? -1n : 1n); };
  const x = integer(a), y = integer(b); return x < y ? -1 : x > y ? 1 : 0;
};
const summary = z.object({ mean: managerRegimeDecimal, median: managerRegimeDecimal,
  min: managerRegimeDecimal, max: managerRegimeDecimal,
  quantiles: z.array(z.object({ probability: managerRegimeDecimal, value: managerRegimeDecimal }).strict()).max(9),
  method: z.literal("DESCRIPTIVE_NET_TWR_LINEAR_EMPIRICAL_UNWEIGHTED_QUANTILES"),
  cost_assumptions_refs: z.array(opaque).min(1).max(4096),
  outcome_from_ms: utcMilliseconds, outcome_to_ms: utcMilliseconds,
}).strict().superRefine((v, c) => {
  if (compare(v.min, "-1") < 0 || compare(v.min, v.max) > 0 || v.outcome_from_ms >= v.outcome_to_ms ||
    [v.mean, v.median, ...v.quantiles.map(q => q.value)].some(x => compare(x, v.min) < 0 || compare(x, v.max) > 0) ||
    v.quantiles.some(q => compare(q.probability, "0") < 0 || compare(q.probability, "1") > 0) ||
    !unique(v.quantiles.map(q => String(Number(q.probability)))) || !unique(v.cost_assumptions_refs))
    c.addIssue({ code: "custom", message: "REGIME_PUBLIC_SUMMARY_INVALID" });
});
const stageResult = z.object({ stage: evidenceStage,
  evidence_kind: z.enum(["research_simulated", "forward_simulated", "actual"]),
  economic_domain_ref: opaque, account_mode_ref: opaque,
  status: z.enum(["supported", "weak_support"]), reason_codes: reasonCodes,
  neighbor_count: count, distinct_episode_count: count, effective_sample_size: managerRegimeDecimal,
  nearest_distance: managerRegimeDecimal, reference_window_refs: z.array(opaque).min(1).max(4096),
  neighbors: z.array(z.object({ reference_window_ref: opaque, distance: managerRegimeDecimal,
    weight: managerRegimeDecimal }).strict()).min(1).max(4096), matched_outcome_summary: summary,
}).strict().superRefine((v, c) => {
  const actual = v.stage === "Live" || v.stage === "Canary";
  const kind = actual ? "actual" : v.stage === "Paper" || v.stage === "Sandbox" ? "forward_simulated" : "research_simulated";
  if (kind !== v.evidence_kind || v.status === "supported" && !actual ||
    !v.neighbors.length || v.neighbor_count !== v.neighbors.length || v.neighbor_count !== v.reference_window_refs.length ||
    !v.distinct_episode_count || v.distinct_episode_count > v.neighbor_count ||
    compare(v.effective_sample_size, "1") < 0 || compare(v.effective_sample_size, String(v.neighbor_count)) > 0 ||
    !unique(v.reference_window_refs) || v.neighbors.some((n, i) => n.reference_window_ref !== v.reference_window_refs[i] ||
      compare(n.distance, "0") < 0 || compare(n.weight, "0") < 0 || compare(n.weight, "1") > 0) ||
    v.nearest_distance !== v.neighbors.reduce((a, b) => compare(a.distance, b.distance) <= 0 ? a : b).distance)
    c.addIssue({ code: "custom", message: "REGIME_PUBLIC_STAGE_INVALID" });
});
/** This is intentionally NOT managerRegimeResult: no raw locators, params,
 * window/cost/manifest IDs, census/artifact hashes or private evidence revisions. */
export const managerHistoricalRegimeResult = z.object({
  status: z.enum(["supported", "weak_support", "out_of_support", "insufficient_data", "stale", "unbound"]),
  reason_codes: reasonCodes, nearest_distance: managerRegimeDecimal.nullable(),
  eligible_reference_count: count, neighbor_count: count, distinct_episode_count: count,
  stage_breakdown: z.array(stageResult).max(7), reference_window_refs: z.array(opaque).max(4096),
  formula_id: z.literal("market_regime_robust_gaussian_v1_1"),
  qualification: z.literal("RUNTIME_APPROVED"),
  // Deliberately public method/policy provenance per FINAL9.8, not artifact custody.
  policy_version: managerRegimeRef, policy_hash: opaque, approved_policy_id: managerRegimeRef,
  feature_schema_version: managerRegimeRef, calibration_snapshot_ref: opaque,
  calibration_hash: opaque, overlap_policy_id: managerRegimeRef, horizon_ms: utcMilliseconds,
  research_binding_ref: opaque, bound_run_ref: opaque, strategy_version_ref: opaque,
  params_ref: opaque, evidence_snapshot_ref: opaque,
  as_of_ms: utcMilliseconds, feature_cutoff_ms: utcMilliseconds, reference_cutoff_ms: utcMilliseconds.nullable(),
}).strict().superRefine((v, c) => {
  const ids = v.stage_breakdown.flatMap(s => s.reference_window_refs), supported = v.status === "supported" || v.status === "weak_support";
  if (!v.horizon_ms || v.feature_cutoff_ms > v.as_of_ms || v.reference_cutoff_ms !== null && v.reference_cutoff_ms > v.as_of_ms ||
    v.nearest_distance !== null && compare(v.nearest_distance, "0") < 0 || v.neighbor_count > v.eligible_reference_count ||
    v.distinct_episode_count > v.neighbor_count || v.neighbor_count !== v.reference_window_refs.length ||
    !unique(v.reason_codes) || !unique(v.reference_window_refs) || !unique(ids) ||
    ids.slice().sort().join(",") !== v.reference_window_refs.slice().sort().join(",") ||
    !unique(v.stage_breakdown.map(s => s.stage)) || supported !== (v.neighbor_count > 0 && v.stage_breakdown.length > 0) ||
    v.status === "supported" && !v.stage_breakdown.some(s => s.status === "supported") ||
    v.status === "weak_support" && v.stage_breakdown.some(s => s.status === "supported"))
    c.addIssue({ code: "custom", message: "REGIME_PUBLIC_RESULT_INVALID" });
});
const feed = z.union([
  z.object({ availability: z.literal("NOT_PUBLISHED"), reason_code: z.literal("ORIGINAL_FEED_FRESHNESS_NOT_RECORDED") }).strict(),
  z.object({ availability: z.literal("AVAILABLE"), checked_at_ms: utcMilliseconds,
    status: z.enum(["WITHIN_CURRENT_FEED_FRESHNESS", "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS"]),
    source_age_ms: utcMilliseconds, maximum_source_age_ms: utcMilliseconds,
    feature_age_ms: utcMilliseconds, maximum_feature_age_ms: utcMilliseconds,
  }).strict().superRefine((v, c) => { if ((v.status === "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS") !==
    (v.source_age_ms > v.maximum_source_age_ms || v.feature_age_ms > v.maximum_feature_age_ms))
    c.addIssue({ code: "custom", message: "REGIME_PUBLIC_FEED_INVALID" }); }),
]);
export const managerHistoricalRegimeEntry = z.object({
  binding: z.object({ subject_type: z.enum(["alpha", "deployment"]), subject_id: managerRegimeText,
    alpha_id: managerRegimeText, alpha_version_id: managerRegimeText,
    stage_filter: z.array(financialStage).min(1).max(4), comparable_basis_ref: opaque,
    individual_evidence_binding_ref: opaque }).strict(),
  original_input_ref: opaque, derived_input_ref: opaque.nullable(),
  original_publication_ref: opaque, publication_ref: opaque,
  original: z.object({ economic_as_of_ms: utcMilliseconds, evaluation_at_ms: utcMilliseconds,
    feature_cutoff_ms: utcMilliseconds, computed_at_ms: utcMilliseconds, captured_at_ms: utcMilliseconds }).strict(),
  knowledge_cutoff_ms: utcMilliseconds.nullable(), computed_at_ms: utcMilliseconds,
  calculation_revision: managerRegimeRef, feed_freshness: feed, result: managerHistoricalRegimeResult,
}).strict().superRefine((v, c) => {
  const a = v.original, original = v.derived_input_ref === null;
  if (!unique(v.binding.stage_filter) || v.binding.subject_type === "alpha" && v.binding.subject_id !== v.binding.alpha_id ||
    a.feature_cutoff_ms > a.evaluation_at_ms || a.evaluation_at_ms > a.economic_as_of_ms ||
    a.economic_as_of_ms > a.computed_at_ms || a.computed_at_ms > a.captured_at_ms ||
    v.result.as_of_ms !== a.economic_as_of_ms || v.result.feature_cutoff_ms !== a.feature_cutoff_ms ||
    (original ? v.knowledge_cutoff_ms !== null || v.computed_at_ms !== a.computed_at_ms ||
      v.publication_ref !== v.original_publication_ref || v.feed_freshness.availability !== "NOT_PUBLISHED" :
      v.knowledge_cutoff_ms === null || v.knowledge_cutoff_ms < a.economic_as_of_ms ||
      v.knowledge_cutoff_ms < a.captured_at_ms || v.computed_at_ms < v.knowledge_cutoff_ms ||
      v.feed_freshness.availability !== "AVAILABLE") ||
    v.feed_freshness.availability === "AVAILABLE" && (v.feed_freshness.checked_at_ms < v.computed_at_ms ||
      v.feed_freshness.checked_at_ms - a.economic_as_of_ms !== v.feed_freshness.source_age_ms ||
      v.feed_freshness.checked_at_ms - a.feature_cutoff_ms !== v.feed_freshness.feature_age_ms))
    c.addIssue({ code: "custom", message: "REGIME_PUBLIC_ENTRY_INVALID" });
});
/** Availability describes a verified published historical FACT, not whether
 * the fact's intrinsic support status is supported/stale/unbound/etc. */
export const managerHistoricalRegimeDetail = z.union([
  z.object({ availability: z.literal("NOT_PUBLISHED"), reason_code: z.enum([
    "INDEPENDENT_REGIME_REVISION_NOT_SELECTED", "REGIME_TARGET_NOT_AVAILABLE", "REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED",
    "INDEPENDENT_REGIME_RESTATEMENT_NOT_PUBLISHED", "SELECTED_REGIME_REVISION_NOT_PUBLISHED",
  ]) }).strict(),
  z.object({ availability: z.enum(["AVAILABLE", "PARTIAL"]),
    reason_codes: z.array(z.literal("SOURCE_PROJECTION_PARTIAL")).max(1),
    entries: z.array(managerHistoricalRegimeEntry).min(1).max(128),
  }).strict().superRefine((v, c) => {
    if ((v.availability === "PARTIAL") !== (v.reason_codes.length === 1) ||
      !unique(v.entries.map(e => JSON.stringify([e.binding.subject_type, e.binding.subject_id, e.binding.alpha_id,
        e.binding.alpha_version_id, [...e.binding.stage_filter].sort(), e.binding.comparable_basis_ref,
        e.binding.individual_evidence_binding_ref]))))
      c.addIssue({ code: "custom", message: "REGIME_PUBLIC_DETAIL_INVALID" });
  }),
]);
export type ManagerHistoricalRegimeDetail = z.infer<typeof managerHistoricalRegimeDetail>;
export type ManagerHistoricalRegimeEntry = z.infer<typeof managerHistoricalRegimeEntry>;
export type ManagerHistoricalRegimeResult = z.infer<typeof managerHistoricalRegimeResult>;
