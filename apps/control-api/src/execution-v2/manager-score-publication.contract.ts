import { z } from "zod";
import { exactDecimal, financialStage, utcMilliseconds, executionEnvironment } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { managerQualityBand } from "./manager-score";

const text = z.string().min(1).max(256);
const points = exactDecimal.nullable();
const metrics = z.object({ net_excess_twr: points, sharpe_period: points, mdd: points, add: points,
  positive_block_ratio: points, stress_excess_twr: points }).strict();
export const managerScoreBinding = z.object({
  subject_type: z.enum(["alpha", "deployment", "account", "portfolio", "manager_book"]), subject_id: text,
  tuple_population_digest: publicationDigest, partition_digest: publicationDigest,
  stage_filter: z.array(financialStage).min(1).max(4), window_start_ms: utcMilliseconds, window_end_ms: utcMilliseconds,
  comparable_basis_id: text, individual_evidence_binding_id: text,
}).strict();
export const managerScoreQuality = z.object({ formula_id: z.literal("qbts_prb_v1_1"),
  qualification: z.enum(["RUNTIME_APPROVED", "TEST_ONLY", "UNQUALIFIED"]),
  status: z.enum(["available", "provisional", "policy_pending", "unbound", "invalid_data", "stale", "partial_costs", "partial_components", "insufficient_data"]),
  reason_codes: z.array(text).max(64), value: points,
  band_code: z.enum(["weak", "neutral", "fair", "good", "very_good"]).nullable(),
  components: z.object({ P: points, R: points, B: points }).strict().nullable(),
  normalized_points: metrics.nullable(), atomic_contributions: metrics.nullable(),
  bounds: z.object({ lower: exactDecimal, upper: exactDecimal }).strict().nullable(),
  policy_id: text.nullable(), policy_hash: publicationDigest.nullable(), approved_policy_id: text.nullable(),
  comparable_basis_id: text, individual_evidence_binding_id: text.nullable(),
}).strict().superRefine((q, c) => {
  let band: ReturnType<typeof managerQualityBand>=null;
  try {band=managerQualityBand(q.value);} catch {c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_SCORE_RANGE_INVALID"});return;}
  if ((["available", "provisional"].includes(q.status)) !== (q.value !== null) ||
    q.value !== null && (q.qualification !== "RUNTIME_APPROVED" || !q.policy_id || !q.policy_hash || !q.approved_policy_id ||
      band === null || band !== q.band_code) || q.value === null && q.band_code !== null)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "MANAGER_SCORE_PUBLICATION_INVALID" });
});
/** A result computed off request; never a request body or browser-supplied policy. */
export const managerScorePublication = z.object({ slot: z.enum(["RAW", "DIRECT_NAV"]),
  quality: managerScoreQuality, raw_metrics: metrics.nullable(),
  provenance: z.object({ scope: z.object({ workspace_id: text, environment: executionEnvironment, profile_id: text,
    catalogue_digest: publicationDigest }).strict(), binding: managerScoreBinding,
    source_revision: text, source_set_digest: publicationDigest, source_qualification: z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]),
    input_digest: publicationDigest, calculation_revision: text, computed_at_ms: utcMilliseconds,
    source_as_of_ms: utcMilliseconds,
    policy_id: text.nullable(), policy_hash: publicationDigest.nullable(), policy_revision: text.nullable(),
    config_hash: publicationDigest.nullable(), formula_hash: publicationDigest.nullable(), approval_ref: text.nullable(),
    approved_at_ms: utcMilliseconds.nullable(), policy_valid_until_ms: utcMilliseconds.nullable(),
  }).strict(),
}).strict().superRefine((s,c)=>{
  if(s.quality.value!==null && s.provenance.source_qualification!=="SOURCE_VERIFIED")
    c.addIssue({code:z.ZodIssueCode.custom,message:"MANAGER_SCORE_SOURCE_NOT_QUALIFIED"});
});
export type ManagerScorePublication = z.infer<typeof managerScorePublication>;
