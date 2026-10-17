import { accessDigest } from "./access-policy";
import { managerScorePopulationDigest } from "./manager-score-publication";
import type { ManagerMember, ManagerModelDocument } from "./manager-model.contract";
import type { ManagerScorePublication } from "./manager-score-publication.contract";
import type { ManagerCompositionPublication } from "./manager-composition-publication.contract";

export interface ManagerCompositionReadFence {
  /** Remove separately expired diagnostics without recalculating assigned-capital A. */
  project?(publication:ManagerCompositionPublication,rawScores:readonly ManagerScorePublication[]):ManagerCompositionPublication|null;
  /** Private current allocation approval AND all used raw-policy pins. Never a request flag.
   * Selector callers supply the full authorized tuple/stage census before table filters/pages. */
  accepts(publication:ManagerCompositionPublication,rawScores:readonly ManagerScorePublication[],
    expectedMembers?:readonly Pick<ManagerMember,"tuple"|"stage">[]):boolean;
}
/** Caller has already established full accounting + field authority; this
 * additional exact-population check is not an authority grant of its own. */
export function selectManagerCompositionPublications(doc:ManagerModelDocument,members:readonly ManagerMember[],
  subject:{type:"portfolio"|"manager_book";id:string},selectedStages:readonly ManagerMember["stage"][],partitionDigest:string,
  fence?:ManagerCompositionReadFence):ManagerCompositionPublication[] {
  if(!fence || doc.qualification!=="SOURCE_VERIFIED" || doc.source_quality.freshness!=="FRESH" ||
    doc.source_quality.completeness!=="COMPLETE")return [];
  const population=managerScorePopulationDigest(members),stages=[...new Set(selectedStages)].sort();
  if(!stages.length || stages.length!==selectedStages.length)return [];
  const accepted:ManagerCompositionPublication[]=[];
  for(const stored of doc.precomputed_compositions??[]){
    const s=fence.project?fence.project(stored,doc.precomputed_scores??[]):stored;
    if(!s)continue;
    const p=s.provenance,b=p.binding;
    if(b.subject_type===subject.type && b.subject_id===subject.id && b.tuple_population_digest===population &&
      b.partition_digest===partitionDigest && accessDigest([...b.stage_filter].sort())===accessDigest(stages) &&
      b.window_start_ms<b.window_end_ms && b.window_end_ms<=doc.as_of_ms && p.source_as_of_ms===doc.as_of_ms &&
      p.scope.workspace_id===doc.workspace_id && p.scope.environment===doc.environment && p.scope.profile_id===doc.profile_id &&
      p.scope.catalogue_digest===doc.catalogue_digest && p.source_revision===doc.revision && p.source_set_digest===doc.source_set_digest &&
      fence.accepts(s,doc.precomputed_scores??[],members))accepted.push(s);
  }
  // Ambiguous same-scope output never picks a favorable/latest result.
  return accepted.length===1?accepted:[];
}
