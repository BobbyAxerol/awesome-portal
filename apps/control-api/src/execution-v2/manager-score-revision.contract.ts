import {z} from "zod";
import {executionEnvironment,financialStage,utcMilliseconds} from "./foundation.contract";
import {publicationDigest} from "./publication.contract";
import {managerPartition} from "./manager-model.contract";
import {managerScoreBinding,managerScoreQuality,managerScorePublication} from "./manager-score-publication.contract";
import {managerCompositionBinding,managerCompositionResult} from "./manager-composition-publication.contract";

const text=z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
export const managerScoreRevisionMode=z.enum(["ORIGINAL_AS_PUBLISHED","RESTATED_CURRENT_POLICY"]);
const target=z.object({surface:z.enum(["FUND","PORTFOLIO","ALPHA","ACCOUNT","DEPLOYMENT"]),id:text.nullable()}).strict();
const base=z.object({workspace_id:text.optional(),environment:executionEnvironment,surface:target.shape.surface,id:text.optional(),
  metric_family:z.enum(["SCORE","COMPOSITION"]).optional(),
  stage_filter:z.array(financialStage).max(4).default([]),economic_partition:managerPartition,
  source_selector:z.enum(["CURRENT_HEAD","RETAINED_REVISION"]),source_revision:text.optional()}).strict();
function queryIssues(q:z.infer<typeof base>,c:z.RefinementCtx){
  if(q.metric_family==="COMPOSITION"&&q.surface!=="FUND"&&q.surface!=="PORTFOLIO")
    c.addIssue({code:"custom",message:"COMPOSITION_REVISION_TARGET_INVALID"});
  if((q.surface==="FUND")!==(q.id===undefined)||(q.source_selector==="RETAINED_REVISION")!==(q.source_revision!==undefined)||
    new Set(q.stage_filter).size!==q.stage_filter.length)c.addIssue({code:"custom",message:"SCORE_REVISION_QUERY_INVALID"});
  const domain=q.environment==="paper"?["PAPER"]:q.environment==="sandbox"?["SANDBOX"]:["CANARY","LIVE"];
  if(q.stage_filter.some(stage=>!domain.includes(stage)))c.addIssue({code:"custom",message:"SCORE_REVISION_STAGE_INVALID"});
}
export const managerScoreRevisionQuery=base.extend({revision_mode:managerScoreRevisionMode,
  revision_ref:publicationDigest.optional()}).strict().superRefine(queryIssues);
export const managerScoreRevisionHistoryQuery=base.extend({revision_mode:managerScoreRevisionMode,
  limit:z.number().int().min(1).max(50).default(20),after:z.string().min(1).max(4096).optional(),
  before:z.string().min(1).max(4096).optional()}).strict().superRefine((q,c)=>{
    queryIssues(q,c);if(q.after!==undefined&&q.before!==undefined)c.addIssue({code:"custom",message:"SCORE_HISTORY_DIRECTION_INVALID"});
  });
export type ManagerScoreRevisionQuery=z.infer<typeof managerScoreRevisionQuery>;
export type ManagerScoreRevisionHistoryQuery=z.infer<typeof managerScoreRevisionHistoryQuery>;
// Closed projection, not an entire private source/custody/recalculation bundle.
// Deliberately omit profile-wide source_set/payload/calculation-key digests.
export const managerHistoricalScore=z.object({quality:managerScoreQuality,
  raw_metrics:managerScorePublication.innerType().shape.raw_metrics,input_ref:publicationDigest,
  computed_at_ms:utcMilliseconds,calculation_revision:text,policy_revision:text.nullable(),
  config_ref:publicationDigest.nullable()}).strict();
const feedFreshness=z.union([
  z.object({availability:z.literal("AVAILABLE"),status:z.enum([
    "WITHIN_CURRENT_FEED_FRESHNESS","HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS"]),
    checked_at_ms:utcMilliseconds,source_age_ms:utcMilliseconds,maximum_input_age_ms:utcMilliseconds}).strict().superRefine((f,c)=>{
      if((f.status==="HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS")!==(f.source_age_ms>f.maximum_input_age_ms))
        c.addIssue({code:"custom",message:"SCORE_REVISION_FEED_AGE_INVALID"});
    }),
  z.object({availability:z.literal("NOT_PUBLISHED"),reason_code:z.enum([
    "ORIGINAL_FEED_FRESHNESS_NOT_RECORDED","HISTORICAL_CALCULATION_NOT_PUBLISHED"])}).strict(),
]);
export const managerHistoricalScoreEntry=z.object({slot:z.enum(["RAW","DIRECT_NAV"]),binding:managerScoreBinding,
  original_input_ref:publicationDigest,derived_input_ref:publicationDigest.nullable(),
  feed_freshness:feedFreshness,
  availability:z.enum(["AVAILABLE","PARTIAL","NOT_PUBLISHED"]),reason_codes:z.array(text).max(64),
  score:managerHistoricalScore.nullable()}).strict().superRefine((entry,c)=>{
    if(entry.availability==="AVAILABLE"&&entry.score?.quality.value==null||
      entry.availability==="NOT_PUBLISHED"&&entry.score?.quality.value!=null)
      c.addIssue({code:"custom",message:"SCORE_REVISION_ENTRY_INVALID"});
});
const source=z.object({authorized_source_ref:publicationDigest,source_revision:text,
  source_as_of_ms:utcMilliseconds,recorded_through_ms:utcMilliseconds,facts_through_ms:utcMilliseconds.nullable()}).strict();
const policy=z.object({policy_current:z.boolean(),policy_state:z.enum(["CURRENT","NOT_CURRENT","UNKNOWN"]),
  reason_code:z.enum(["POLICY_STATE_NOT_CLASSIFIED","CURRENT_POLICY_NOT_CONFIRMED"]).nullable(),
  economic_source:z.enum(["CURRENT_HEAD","RETAINED_EXACT_REVISION"]),usable_as_current_operational_score:z.literal(false)}).strict()
  .superRefine((p,c)=>{if(p.policy_current!==(p.policy_state==="CURRENT")||(p.policy_state==="CURRENT")!==(p.reason_code===null))
    c.addIssue({code:"custom",message:"SCORE_REVISION_POLICY_INVALID"});});
/** Current full-accounting authorization is mandatory before this detail is
 * selected. allocation_snapshot_id below is an opaque scoped public reference,
 * never the original artifact id, approval pin or a private calculation key. */
export const managerHistoricalComposition=z.union([
  z.object({availability:z.literal("NOT_PUBLISHED"),reason_code:z.enum([
    "COMPOSITION_REVISION_NOT_SELECTED","DEPENDENT_RESTATEMENT_NOT_MATERIALIZED",
    "SELECTED_COMPOSITION_REVISION_NOT_PUBLISHED","ORIGINAL_ALLOCATION_NOT_RETAINED"])}).strict(),
  z.object({availability:z.enum(["AVAILABLE","PARTIAL"]),reason_codes:z.array(text).max(64),
    binding:managerCompositionBinding,result:managerCompositionResult,
    allocation_ref:publicationDigest,allocation_effective_at_ms:utcMilliseconds,
    original_publication_ref:publicationDigest,computed_at_ms:utcMilliseconds,calculation_revision:text,
    raw_dependencies:z.array(z.object({subject_id:text,availability:z.enum(["AVAILABLE","PARTIAL","NOT_PUBLISHED"]),
      reason_codes:z.array(text).max(64),original_input_ref:publicationDigest.nullable(),
      derived_input_ref:publicationDigest.nullable()}).strict()).max(10_000),
  }).strict().superRefine((value,c)=>{
    if((value.availability==="AVAILABLE")!==(value.result.value!==null)||
      !publicationDigest.safeParse(value.result.allocation_snapshot_id).success||
      new Set(value.raw_dependencies.map(row=>row.subject_id)).size!==value.raw_dependencies.length||
      [...value.raw_dependencies.map(row=>row.subject_id)].sort().join("\u0000")!==
        [...value.result.contributions.map(row=>row.subject_id)].sort().join("\u0000")||
      value.raw_dependencies.some(row=>row.availability==="AVAILABLE"?
        row.original_input_ref===null||row.reason_codes.length!==0:row.reason_codes.length===0))
      c.addIssue({code:"custom",message:"COMPOSITION_REVISION_DETAIL_INVALID"});
  }),
]);
export const managerScoreRevisionView=z.object({schema_version:z.literal("portal.execution.manager-score-revision.v1"),
  target,workspace_id:text,environment:executionEnvironment,revision_mode:managerScoreRevisionMode,
  purpose:z.literal("HISTORICAL_ANALYSIS_ONLY"),operational_current:z.literal(false),revision_ref:publicationDigest,
  supersedes_revision_ref:publicationDigest.nullable(),supersedes_reason:z.enum([
    "TARGET_HISTORY_LINEAGE_NOT_PROJECTED","ORIGINAL_HAS_NO_PREDECESSOR","NO_AUTHORIZED_PREDECESSOR","AUTHORIZED_PREDECESSOR"]),
  source,knowledge_cutoff_ms:utcMilliseconds.nullable(),
  knowledge_cutoff_reason:z.enum(["ORIGINAL_KNOWLEDGE_CUTOFF_NOT_RECORDED","RESTATEMENT_NOT_PUBLISHED"]).nullable(),
  computed_at_ms:utcMilliseconds.nullable(),computed_at_reason:z.enum(["ORIGINAL_COMPUTE_TIMES_ARE_PER_ENTRY","RESTATEMENT_NOT_PUBLISHED"]).nullable(),
  eligibility:policy,availability:z.enum(["AVAILABLE","PARTIAL","NOT_PUBLISHED"]),
  reason_codes:z.array(text).max(64),score_details:z.array(managerHistoricalScoreEntry).max(128),
  composition:managerHistoricalComposition,
  regime:z.object({availability:z.literal("NOT_PUBLISHED"),reason_code:z.literal("INDEPENDENT_REGIME_REVISION_NOT_SELECTED")}).strict(),
}).strict().superRefine((view,c)=>{
  if((view.supersedes_reason==="AUTHORIZED_PREDECESSOR")!==(view.supersedes_revision_ref!==null)||
    view.supersedes_revision_ref===view.revision_ref||
    view.revision_mode==="ORIGINAL_AS_PUBLISHED"&&view.supersedes_revision_ref!==null)
    c.addIssue({code:"custom",message:"SCORE_REVISION_LINEAGE_INVALID"});
  const original=view.revision_mode==="ORIGINAL_AS_PUBLISHED";
  const missingRestated=!original&&view.knowledge_cutoff_ms===null&&view.computed_at_ms===null&&
    view.knowledge_cutoff_reason==="RESTATEMENT_NOT_PUBLISHED"&&view.computed_at_reason==="RESTATEMENT_NOT_PUBLISHED"&&
    view.availability==="NOT_PUBLISHED"&&view.score_details.length===0&&!view.eligibility.policy_current;
  if(original?(view.knowledge_cutoff_ms!==null||view.knowledge_cutoff_reason!=="ORIGINAL_KNOWLEDGE_CUTOFF_NOT_RECORDED"||
    view.computed_at_ms!==null||view.computed_at_reason!=="ORIGINAL_COMPUTE_TIMES_ARE_PER_ENTRY"):
    !missingRestated&&(view.knowledge_cutoff_ms===null||view.knowledge_cutoff_reason!==null||view.computed_at_ms===null||view.computed_at_reason!==null||
      view.knowledge_cutoff_ms<view.source.source_as_of_ms||view.computed_at_ms<view.knowledge_cutoff_ms))
    c.addIssue({code:"custom",message:"SCORE_REVISION_CLOCK_INVALID"});
  const compositionSelected=view.composition.availability!=="NOT_PUBLISHED";
  if(view.composition.availability!=="NOT_PUBLISHED"){
    const detail=view.composition;
    if(view.score_details.length!==0||
      (view.target.surface!=="FUND"&&view.target.surface!=="PORTFOLIO")||
      detail.computed_at_ms<view.source.source_as_of_ms||
      detail.binding.window_end_ms>view.source.source_as_of_ms||
      detail.allocation_effective_at_ms>view.source.source_as_of_ms||
      !original&&detail.computed_at_ms!==view.computed_at_ms)
      c.addIssue({code:"custom",message:"COMPOSITION_REVISION_CONTEXT_INVALID"});
  }
  if(view.availability==="AVAILABLE"&&(compositionSelected?
    view.composition.availability!=="AVAILABLE":!view.score_details.length||view.score_details.some(e=>e.availability!=="AVAILABLE")))
    c.addIssue({code:"custom",message:"SCORE_REVISION_AVAILABILITY_INVALID"});
  if(compositionSelected&&view.availability!==view.composition.availability)
    c.addIssue({code:"custom",message:"COMPOSITION_REVISION_AVAILABILITY_INVALID"});
  for(const entry of view.score_details)if(entry.feed_freshness.availability==="AVAILABLE"&&
    (original||entry.feed_freshness.checked_at_ms-view.source.source_as_of_ms!==entry.feed_freshness.source_age_ms))
    c.addIssue({code:"custom",message:"SCORE_REVISION_FEED_CLOCK_INVALID"});
});
const historyEnvelope={schema_version:z.literal("portal.execution.manager-score-history.v1"),
  target,workspace_id:text,environment:executionEnvironment,revision_mode:managerScoreRevisionMode,
  purpose:z.literal("HISTORICAL_ANALYSIS_ONLY"),operational_current:z.literal(false)};
// Structural union preserves the absence/count contract in generated JSON and
// browser types too, not only in server-side cross-field refinements.
export const managerScoreRevisionHistory=z.union([z.object({...historyEnvelope,
  availability:z.literal("AVAILABLE"),reason_code:z.null(),
  page:z.object({limit:z.number().int().min(1).max(50),returned_count:z.number().int().min(0).max(50),
    authorized_total_count:z.number().int().min(0).max(32),
    next_cursor:z.string().min(1).max(4096).nullable(),previous_cursor:z.string().min(1).max(4096).nullable()}).strict(),
  items:z.array(managerScoreRevisionView).max(50),}).strict(),z.object({...historyEnvelope,
  availability:z.literal("NOT_PUBLISHED"),reason_code:z.literal("SCOPED_HISTORY_ENUMERATION_NOT_INSTALLED"),
  page:z.object({limit:z.number().int().min(1).max(50),returned_count:z.null(),authorized_total_count:z.null(),
    next_cursor:z.null(),previous_cursor:z.null()}).strict(),items:z.array(managerScoreRevisionView).length(0),
}).strict()]).superRefine((history,c)=>{
  const p=history.page,unavailable=history.availability==="NOT_PUBLISHED";
  if(unavailable?(history.reason_code!=="SCOPED_HISTORY_ENUMERATION_NOT_INSTALLED"||history.items.length!==0||
    p.returned_count!==null||p.authorized_total_count!==null||p.next_cursor!==null||p.previous_cursor!==null):
    (history.reason_code!==null||p.returned_count!==history.items.length||p.authorized_total_count===null||
      p.authorized_total_count<history.items.length||history.items.length>p.limit||
      p.authorized_total_count===0&&(p.next_cursor!==null||p.previous_cursor!==null)))
    c.addIssue({code:"custom",message:"SCORE_HISTORY_AVAILABILITY_INVALID"});
  if(new Set(history.items.map(v=>v.revision_ref)).size!==history.items.length||
    history.items.some(v=>v.workspace_id!==history.workspace_id||v.environment!==history.environment||
      v.revision_mode!==history.revision_mode||v.target.surface!==history.target.surface||v.target.id!==history.target.id))
    c.addIssue({code:"custom",message:"SCORE_HISTORY_CONTEXT_INVALID"});
});
export type ManagerScoreRevisionView=z.infer<typeof managerScoreRevisionView>;
