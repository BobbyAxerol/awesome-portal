import { accessDigest } from "./access-policy";
import type { ManagerMember, ManagerModelDocument } from "./manager-model.contract";
import type { ManagerScorePublication } from "./manager-score-publication.contract";

/** Stable population identity, independent of source object property ordering. */
export function managerScorePopulationDigest(members: readonly ManagerMember[]): string {
  return accessDigest([...new Set(members.map(m => JSON.stringify([m.tuple.alpha_id, m.tuple.alpha_version_id,
    m.tuple.portfolio_id, m.tuple.deployment_id, m.tuple.account_id])))].sort());
}
export interface ManagerScoreReadFence {
  /** Current private approved policy, never a request field or a stored JSON boolean. */
  accepts(score: ManagerScorePublication): boolean;
}
export function selectManagerScorePublications(doc: ManagerModelDocument, members: readonly ManagerMember[],
  subject: { type: ManagerScorePublication["provenance"]["binding"]["subject_type"]; id: string },
  partitionDigest: string | null, fence?: ManagerScoreReadFence): ManagerScorePublication[] {
  if (!fence || !members.length || doc.qualification !== "SOURCE_VERIFIED" ||
    doc.source_quality.freshness !== "FRESH" || doc.source_quality.completeness !== "COMPLETE") return [];
  const population = managerScorePopulationDigest(members), stages = [...new Set(members.map(m => m.stage))].sort();
  const accepted = (doc.precomputed_scores ?? []).filter(s => {
    const p = s.provenance, b = p.binding;
    return b.subject_type === subject.type && b.subject_id === subject.id && b.tuple_population_digest === population &&
      (partitionDigest === null || b.partition_digest === partitionDigest) && accessDigest(b.stage_filter) === accessDigest(stages) &&
      b.window_start_ms < b.window_end_ms && b.window_end_ms <= doc.as_of_ms && p.source_as_of_ms === doc.as_of_ms &&
      p.scope.workspace_id === doc.workspace_id && p.scope.environment === doc.environment && p.scope.profile_id === doc.profile_id &&
      p.scope.catalogue_digest === doc.catalogue_digest && p.source_revision === doc.revision && p.source_set_digest === doc.source_set_digest &&
      s.quality.comparable_basis_id === b.comparable_basis_id && s.quality.individual_evidence_binding_id === b.individual_evidence_binding_id &&
      fence.accepts(s);
  });
  // Conflicting publications never silently pick the highest/latest score.
  const keys = accepted.map(s => JSON.stringify([s.slot, s.provenance.binding.partition_digest]));
  return new Set(keys).size === keys.length ? accepted : [];
}
