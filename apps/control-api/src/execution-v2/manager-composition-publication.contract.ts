import { z } from "zod";
import { exactDecimal, financialStage, utcMilliseconds, executionEnvironment } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { managerQualityBand } from "./manager-score";

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const decimal = exactDecimal.nullable();
const compare = (a:string,b:string) => {
  const scale=Math.max(a.split(".")[1]?.length??0,b.split(".")[1]?.length??0);
  const integer=(v:string) => { const negative=v.startsWith("-");const [whole,fraction=""]=(negative?v.slice(1):v).split(".");
    return BigInt(whole+fraction.padEnd(scale,"0"))*(negative?-1n:1n); };
  const x=integer(a),y=integer(b);return x<y?-1:x>y?1:0;
};
export const managerCompositionScope = z.object({ workspace_id: text, environment: executionEnvironment,
  profile_id: text, catalogue_digest: publicationDigest }).strict();
export const managerCompositionBinding = z.object({ subject_type: z.enum(["portfolio", "manager_book"]), subject_id: text,
  tuple_population_digest: publicationDigest, partition_digest: publicationDigest,
  stage_filter: z.array(financialStage).min(1).max(4), window_start_ms: utcMilliseconds, window_end_ms: utcMilliseconds,
  comparable_basis_id: text, individual_evidence_binding_id: text }).strict().superRefine((v,c) => {
  if (v.window_end_ms <= v.window_start_ms || new Set(v.stage_filter).size !== v.stage_filter.length)
    c.addIssue({ code:z.ZodIssueCode.custom,message:"COMPOSITION_BINDING_INVALID" });
});
export const managerCompositionResult = z.object({
  value: decimal, status: z.enum(["available", "provisional", "partial_coverage", "incomparable_basis", "no_allocation", "invalid_data"]),
  reason_codes: z.array(text).max(64), band_code: z.enum(["weak","neutral","fair","good","very_good"]).nullable(),
  weight_basis: z.literal("allocated_economic_capital"), allocation_snapshot_id: text,
  total_allocated_capital: decimal, score_coverage_allocated: decimal, unscored_allocated_weight: decimal,
  provisional_allocated_weight: decimal, mature_allocated_weight: decimal,
  allocation_coverage_nav: decimal, scored_nav_weight: decimal, idle_cash_weight: decimal, nav_coverage_reason: text.nullable(),
  bounds: z.object({ lower:exactDecimal,upper:exactDecimal }).strict().nullable(),
  contributions: z.array(z.object({ subject_id:text,allocation_weight:exactDecimal,value:decimal,band_code:z.null() }).strict()).max(10_000),
  diagnostics: z.object({ allocation_hhi:decimal,score_contribution_hhi:decimal,score_dispersion:decimal,
    reason_codes:z.array(text).max(64) }).strict(),
}).strict().superRefine((v,c) => {
  const invalid = () => c.addIssue({ code:z.ZodIssueCode.custom,message:"COMPOSITION_RESULT_INCONSISTENT" });
  if (["available","provisional"].includes(v.status) !== (v.value !== null)) invalid();
  try { if (managerQualityBand(v.value) !== v.band_code) invalid(); } catch { invalid(); }
  for (const key of ["score_coverage_allocated","unscored_allocated_weight","provisional_allocated_weight","mature_allocated_weight",
    "allocation_coverage_nav","scored_nav_weight","idle_cash_weight"] as const) {
    if (v[key] !== null && (compare(v[key],"0") < 0 || compare(v[key],"1") > 0)) invalid();
  }
  if (new Set(v.contributions.map(x=>x.subject_id)).size !== v.contributions.length ||
    v.contributions.some(x=>compare(x.allocation_weight,"0")<0 || compare(x.allocation_weight,"1")>0 ||
      x.value!==null && (compare(x.value,"0")<0 || compare(x.value,"100")>0)) ||
    v.bounds!==null && (compare(v.bounds.lower,"0")<0 || compare(v.bounds.upper,"100")>0 || compare(v.bounds.lower,v.bounds.upper)>0)) invalid();
  if (v.value!==null && v.bounds!==null || v.total_allocated_capital!==null && compare(v.total_allocated_capital,"0")<0) invalid();
  if(v.value!==null && (v.total_allocated_capital===null || compare(v.total_allocated_capital,"0")<=0 ||
    v.score_coverage_allocated===null || compare(v.score_coverage_allocated,"1")!==0 ||
    v.unscored_allocated_weight===null || compare(v.unscored_allocated_weight,"0")!==0 ||
    !v.contributions.length || v.contributions.some(x=>x.value===null))) invalid();
  if(v.status==="available" && (v.provisional_allocated_weight===null || compare(v.provisional_allocated_weight,"0")!==0) ||
    v.status==="provisional" && (v.provisional_allocated_weight===null || compare(v.provisional_allocated_weight,"0")<=0)) invalid();
  if(v.status==="no_allocation" && (v.total_allocated_capital===null || compare(v.total_allocated_capital,"0")!==0 ||
    v.score_coverage_allocated!==null || v.contributions.length>0 || v.bounds!==null)) invalid();
  if(["partial_coverage","incomparable_basis"].includes(v.status) && v.bounds===null) invalid();
  for(const key of ["allocation_hhi","score_contribution_hhi"] as const)
    if(v.diagnostics[key]!==null && (compare(v.diagnostics[key],"0")<0 || compare(v.diagnostics[key],"1")>0)) invalid();
  if(v.diagnostics.score_dispersion!==null && compare(v.diagnostics.score_dispersion,"0")<0) invalid();
});
/** Different semantics from a raw P/R/B result. No request-side calculation. */
export const managerCompositionPublication = z.object({ slot:z.literal("COMPOSITION"),result:managerCompositionResult,
  provenance:z.object({ scope:managerCompositionScope,binding:managerCompositionBinding,
    source_revision:text,source_set_digest:publicationDigest,source_as_of_ms:utcMilliseconds,
    source_qualification:z.literal("SOURCE_VERIFIED"),input_digest:publicationDigest,
    calculation_revision:text,computed_at_ms:utcMilliseconds,
    allocation_artifact_sha256:publicationDigest,allocation_revision:text,ownership_manifest_ref:text,
    full_accounting_manifest_ref:text,allocation_effective_at_ms:utcMilliseconds,
    approval_ref:text,approved_at_ms:utcMilliseconds,valid_until_ms:utcMilliseconds,
    raw_score_refs:z.array(z.object({ subject_id:text,publication_digest:publicationDigest }).strict()).max(128),
  }).strict(),
}).strict().superRefine((v,c) => {
  const p=v.provenance;
  const contributions=new Map(v.result.contributions.map(x=>[x.subject_id,x]));
  const references=new Set(p.raw_score_refs.map(x=>x.subject_id));
  if(p.approved_at_ms>p.source_as_of_ms || p.allocation_effective_at_ms>p.source_as_of_ms ||
    p.source_as_of_ms>p.computed_at_ms || p.computed_at_ms>=p.valid_until_ms ||
    p.binding.window_end_ms>p.source_as_of_ms ||
    references.size!==p.raw_score_refs.length || p.raw_score_refs.some(x=>!contributions.has(x.subject_id)) ||
    v.result.contributions.some(x=>x.value!==null && !references.has(x.subject_id)))
    c.addIssue({code:z.ZodIssueCode.custom,message:"COMPOSITION_PROVENANCE_INVALID"});
});
export type ManagerCompositionPublication = z.infer<typeof managerCompositionPublication>;
export type ManagerCompositionBinding = z.infer<typeof managerCompositionBinding>;
export type ManagerCompositionScope = z.infer<typeof managerCompositionScope>;
