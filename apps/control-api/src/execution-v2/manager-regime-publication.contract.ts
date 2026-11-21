import { z } from "zod";
import { executionEnvironment, financialStage, utcMilliseconds } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";

/** Closed proposal for an off-request descriptive result, never a browser input or authority pin. */
export const managerRegimeText = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
/** Approved opaque public receipt IDs only: no host paths, URLs or free-form source messages. */
export const managerRegimeRef = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$(?![\s\S])/);
export const managerRegimeDecimal = z.string().min(1).max(512)
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/)
  .refine(v => Number.isFinite(Number(v)) && (Number(v) !== 0 || !/[1-9]/.test(v)), "REGIME_DECIMAL_INVALID");
const count = z.number().int().min(0).max(4096);
const reasons = z.array(managerRegimeRef).max(64);
const stage = z.enum(["ResearchIS", "ResearchOOS", "ResearchValidation", "Paper", "Sandbox", "Canary", "Live"]);
const evidenceKind = z.enum(["research_simulated", "forward_simulated", "actual"]);
export const managerRegimeScope = z.object({ workspace_id: managerRegimeText, environment: executionEnvironment,
  profile_id: managerRegimeText, catalogue_digest: publicationDigest }).strict();
export const managerRegimeTuple = z.object({ alpha_id: managerRegimeText, alpha_version_id: managerRegimeText,
  portfolio_id: managerRegimeText, deployment_id: managerRegimeText, account_id: managerRegimeText }).strict();
export const managerRegimePopulationMember = z.object({ tuple: managerRegimeTuple, stage: financialStage }).strict();
export const managerRegimeSubjectBinding = z.object({ subject_type: z.enum(["alpha", "deployment"]),
  subject_id: managerRegimeText, alpha_id: managerRegimeText, alpha_version_id: managerRegimeText,
  tuple_population_digest: publicationDigest, partition_digest: publicationDigest,
  stage_filter: z.array(financialStage).min(1).max(4), comparable_basis_id: managerRegimeRef,
  individual_evidence_binding_id: managerRegimeRef }).strict().superRefine((v, c) => {
  if (new Set(v.stage_filter).size !== v.stage_filter.length || v.subject_type === "alpha" && v.subject_id !== v.alpha_id)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "REGIME_SUBJECT_BINDING_INVALID" });
});
/** No public verified flag: the independent source loader verifies this manifest before private use. */
export const managerRegimeResearchBinding = z.object({ alpha_id: managerRegimeText,
  research_binding_id: managerRegimeRef, run_id: managerRegimeText, strategy_version: managerRegimeText,
  params_hash: publicationDigest, trade_params_hash: publicationDigest, param_mapping_version: managerRegimeRef,
  universe_id: managerRegimeRef, venue: managerRegimeRef, data_snapshot_id: managerRegimeRef,
  split_manifest_hash: publicationDigest, binding_effective_at_ms: utcMilliseconds,
  binding_created_at_ms: utcMilliseconds, run_completed_at_ms: utcMilliseconds,
  artifact_available_at_ms: utcMilliseconds, evidence_available_at_ms: utcMilliseconds,
  source_locator: managerRegimeRef }).strict();
export const managerRegimeFeatures = z.object({ feature_schema_version: managerRegimeRef,
  values: z.array(z.object({ feature: managerRegimeRef, value: managerRegimeDecimal.nullable(),
    source_locator: managerRegimeRef }).strict()).min(1).max(3),
  feature_cutoff_ms: utcMilliseconds, closed_through_ms: utcMilliseconds, feed_lag_ms: utcMilliseconds,
  available_at_ms: utcMilliseconds, source_locator: managerRegimeRef }).strict();

const compare = (a: string, b: string): number => {
  const scale = Math.max(a.split(".")[1]?.length ?? 0, b.split(".")[1]?.length ?? 0);
  const integer = (v: string) => { const negative = v.startsWith("-");
    const [whole, fraction = ""] = (negative ? v.slice(1) : v).split(".");
    return BigInt(whole + fraction.padEnd(scale, "0")) * (negative ? -1n : 1n); };
  const x = integer(a), y = integer(b); return x < y ? -1 : x > y ? 1 : 0;
};
const summary = z.object({ mean: managerRegimeDecimal, median: managerRegimeDecimal,
  min: managerRegimeDecimal, max: managerRegimeDecimal,
  quantiles: z.array(z.object({ probability: managerRegimeDecimal, value: managerRegimeDecimal }).strict()).max(9),
  method: z.literal("DESCRIPTIVE_NET_TWR_LINEAR_EMPIRICAL_UNWEIGHTED_QUANTILES"),
  cost_assumptions_ids: z.array(managerRegimeRef).min(1).max(4096),
  outcome_from_ms: utcMilliseconds, outcome_to_ms: utcMilliseconds }).strict().superRefine((v, c) => {
  if (compare(v.min, "-1") < 0 || compare(v.min, v.max) > 0 || v.outcome_from_ms >= v.outcome_to_ms ||
    [v.mean, v.median, ...v.quantiles.map(q => q.value)].some(x => compare(x, v.min) < 0 || compare(x, v.max) > 0) ||
    v.quantiles.some(q => compare(q.probability, "0") < 0 || compare(q.probability, "1") > 0) ||
    new Set(v.quantiles.map(q => Number(q.probability))).size !== v.quantiles.length ||
    new Set(v.cost_assumptions_ids).size !== v.cost_assumptions_ids.length)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "REGIME_SUMMARY_INVALID" });
});
const stageResult = z.object({ stage, evidence_kind: evidenceKind, economic_domain: managerRegimeRef,
  account_mode: managerRegimeRef, status: z.enum(["supported", "weak_support"]), reason_codes: reasons,
  neighbor_count: count, distinct_episode_count: count, effective_sample_size: managerRegimeDecimal,
  nearest_distance: managerRegimeDecimal, reference_window_ids: z.array(managerRegimeRef).min(1).max(4096),
  neighbors: z.array(z.object({ reference_window_id: managerRegimeRef, distance: managerRegimeDecimal,
    weight: managerRegimeDecimal, source_locator: managerRegimeRef, manifest_hash: publicationDigest }).strict()).min(1).max(4096),
  matched_outcome_summary: summary }).strict().superRefine((v, c) => {
  const actual = v.stage === "Canary" || v.stage === "Live";
  const expectedKind = actual ? "actual" : v.stage === "Paper" || v.stage === "Sandbox" ? "forward_simulated" : "research_simulated";
  if (v.evidence_kind !== expectedKind || v.status === "supported" && !actual ||
    v.neighbor_count !== v.neighbors.length || v.neighbor_count !== v.reference_window_ids.length ||
    !v.distinct_episode_count || v.distinct_episode_count > v.neighbor_count ||
    compare(v.effective_sample_size, "1") < 0 || compare(v.effective_sample_size, String(v.neighbor_count)) > 0 ||
    compare(v.nearest_distance, "0") < 0 || new Set(v.reference_window_ids).size !== v.reference_window_ids.length ||
    v.neighbors.some((n, i) => n.reference_window_id !== v.reference_window_ids[i] || compare(n.distance, "0") < 0 ||
      compare(n.weight, "0") < 0 || compare(n.weight, "1") > 0) ||
    v.nearest_distance !== v.neighbors.reduce((a, b) => compare(a.distance, b.distance) <= 0 ? a : b).distance)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "REGIME_STAGE_INVALID" });
});
export const managerRegimeResult = z.object({ status: z.enum(["supported", "weak_support", "out_of_support", "insufficient_data", "stale", "unbound"]),
  reason_codes: reasons, reasons: z.array(z.object({ code: managerRegimeRef, source_locator: managerRegimeRef,
    reference_window_id: managerRegimeRef.nullable() }).strict()).max(32768),
  nearest_distance: managerRegimeDecimal.nullable(), eligible_reference_count: count,
  neighbor_count: count, distinct_episode_count: count, stage_breakdown: z.array(stageResult).max(7),
  reference_window_ids: z.array(managerRegimeRef).max(4096),
  formula_id: z.literal("market_regime_robust_gaussian_v1_1"), qualification: z.literal("RUNTIME_APPROVED"),
  policy_version: managerRegimeRef, policy_hash: publicationDigest, approved_policy_id: managerRegimeRef,
  feature_schema_version: managerRegimeRef, calibration_snapshot_id: managerRegimeRef, calibration_hash: publicationDigest,
  overlap_policy_id: managerRegimeRef, horizon_ms: utcMilliseconds,
  research_binding_id: managerRegimeRef, bound_run_id: managerRegimeText, strategy_version: managerRegimeText,
  params_hash: publicationDigest, evidence_snapshot_id: managerRegimeRef, as_of_ms: utcMilliseconds,
  feature_cutoff_ms: utcMilliseconds, reference_cutoff_ms: utcMilliseconds.nullable(),
  revision: managerRegimeRef, supersedes_revision: managerRegimeRef.nullable(), preview: z.null() }).strict().superRefine((v, c) => {
  const ids = v.stage_breakdown.flatMap(s => s.reference_window_ids);
  const successful = v.status === "supported" || v.status === "weak_support";
  const equalSet = (a: readonly string[], b: readonly string[]) => {
    const left = [...a].sort(), right = [...b].sort();
    return left.length === right.length && left.every((x, i) => x === right[i]);
  };
  if (!v.horizon_ms || v.feature_cutoff_ms > v.as_of_ms || v.reference_cutoff_ms !== null && v.reference_cutoff_ms > v.as_of_ms ||
    v.nearest_distance !== null && compare(v.nearest_distance, "0") < 0 ||
    v.neighbor_count > v.eligible_reference_count || v.distinct_episode_count > v.neighbor_count ||
    new Set(v.reference_window_ids).size !== v.reference_window_ids.length || new Set(ids).size !== ids.length ||
    new Set(v.stage_breakdown.map(s => s.stage)).size !== v.stage_breakdown.length ||
    v.neighbor_count !== v.reference_window_ids.length || !equalSet(ids, v.reference_window_ids) ||
    !equalSet([...new Set(v.reasons.map(r => r.code))], v.reason_codes) ||
    successful !== (v.neighbor_count > 0 && v.stage_breakdown.length > 0) ||
    v.status === "supported" && !v.stage_breakdown.some(s => s.status === "supported") ||
    v.status === "weak_support" && v.stage_breakdown.some(s => s.status === "supported"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "REGIME_RESULT_INCONSISTENT" });
});
export const managerRegimePublication = z.object({ slot: z.literal("REGIME"), result: managerRegimeResult,
  provenance: z.object({ scope: managerRegimeScope, binding: managerRegimeSubjectBinding,
    research_binding: managerRegimeResearchBinding, source_revision: managerRegimeText,
    projection_generation: managerRegimeText, source_set_digest: publicationDigest,
    source_as_of_ms: utcMilliseconds, source_qualification: z.literal("SOURCE_VERIFIED"),
    input_digest: publicationDigest, calculation_revision: managerRegimeRef, computed_at_ms: utcMilliseconds,
    policy_artifact_sha256: publicationDigest, policy_revision: managerRegimeRef, formula_hash: publicationDigest,
    feature_definition_hash: publicationDigest, approval_ref: managerRegimeRef,
    approved_at_ms: utcMilliseconds, policy_valid_until_ms: utcMilliseconds,
    evidence_artifact_sha256: publicationDigest, evidence_manifest_hash: publicationDigest,
    population_census_digest: publicationDigest, reference_census_digest: publicationDigest, source_acceptance_ref: managerRegimeRef,
    source_accepted_at_ms: utcMilliseconds, evidence_valid_until_ms: utcMilliseconds,
    evaluation_at_ms: utcMilliseconds }).strict(),
}).strict().superRefine((v, c) => {
  const p = v.provenance, r = v.result, b = p.research_binding;
  if (p.approved_at_ms > p.evaluation_at_ms || p.evaluation_at_ms > p.source_as_of_ms ||
    p.source_accepted_at_ms > p.source_as_of_ms || p.source_as_of_ms > p.computed_at_ms ||
    p.computed_at_ms >= p.policy_valid_until_ms || p.computed_at_ms >= p.evidence_valid_until_ms ||
    r.as_of_ms !== p.source_as_of_ms || r.research_binding_id !== b.research_binding_id || r.bound_run_id !== b.run_id ||
    r.strategy_version !== b.strategy_version || r.params_hash !== b.params_hash || b.alpha_id !== p.binding.alpha_id)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "REGIME_PUBLICATION_PROVENANCE_INVALID" });
});
export type ManagerRegimeScope = z.infer<typeof managerRegimeScope>;
export type ManagerRegimeSubjectBinding = z.infer<typeof managerRegimeSubjectBinding>;
export type ManagerRegimePopulationMember = z.infer<typeof managerRegimePopulationMember>;
export type ManagerRegimePublication = z.infer<typeof managerRegimePublication>;
