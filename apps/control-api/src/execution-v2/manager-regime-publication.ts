import { accessDigest } from "./access-policy";
import { managerScorePopulationDigest } from "./manager-score-publication";
import type { ManagerMember, ManagerModelDocument } from "./manager-model.contract";
import type { ManagerRegimePublication } from "./manager-regime-publication.contract";

export interface ManagerRegimeReadFence {
  /** Installed current policy/source proof, not a request or stored JSON flag. */
  accepts(publication: ManagerRegimePublication): boolean;
}

export function managerRegimePopulationCensusDigest(members: readonly Pick<ManagerMember, "tuple" | "stage">[]): string {
  return accessDigest(members.map(m => JSON.stringify([JSON.stringify([m.tuple.alpha_id, m.tuple.alpha_version_id,
    m.tuple.portfolio_id, m.tuple.deployment_id, m.tuple.account_id]), m.stage])).sort());
}

/** Descriptive per-alpha/version or deployment outputs only: never a Fund or
 * Portfolio aggregate. Caller applies explicit regime/binding/provenance fields
 * and current resource authority first. Exact correlated reference population
 * must match BEFORE any statistics, filters, page or serialization. */
export function selectManagerRegimePublications(doc: ManagerModelDocument,
  members: readonly ManagerMember[], selectedStages: readonly ManagerMember["stage"][],
  partitionDigest: string | null, subject: { type: "alpha" | "deployment"; id?: string },
  fence?: ManagerRegimeReadFence): ManagerRegimePublication[] {
  if (!fence || !members.length || doc.qualification !== "SOURCE_VERIFIED") return [];
  const stages = [...new Set(selectedStages)].sort();
  if (stages.length !== selectedStages.length) return [];
  const accepted: ManagerRegimePublication[] = [];
  for (const value of doc.precomputed_regimes ?? []) {
    const p = value.provenance, b = p.binding;
    if (b.subject_type !== subject.type || subject.id !== undefined && b.subject_id !== subject.id ||
      partitionDigest !== null && b.partition_digest !== partitionDigest ||
      p.scope.workspace_id !== doc.workspace_id || p.scope.environment !== doc.environment ||
      p.scope.profile_id !== doc.profile_id || p.scope.catalogue_digest !== doc.catalogue_digest ||
      p.source_revision !== doc.revision || p.projection_generation !== doc.projection_generation ||
      p.source_set_digest !== doc.source_set_digest || p.source_as_of_ms !== doc.as_of_ms) continue;
    const population = members.filter(m => m.tuple.alpha_id === b.alpha_id &&
      m.tuple.alpha_version_id === b.alpha_version_id &&
      (b.subject_type !== "deployment" || m.tuple.deployment_id === b.subject_id));
    const expectedStages = stages.length ? stages : [...new Set(population.map(m => m.stage))].sort();
    if (!population.length || accessDigest([...b.stage_filter].sort()) !== accessDigest(expectedStages) ||
      p.population_census_digest !== managerRegimePopulationCensusDigest(population) ||
      b.tuple_population_digest !== managerScorePopulationDigest(population) ||
      !fence.accepts(value)) continue;
    accepted.push(value);
  }
  const keys = accepted.map(s => { const b = s.provenance.binding; return accessDigest({
    subject_type: b.subject_type, subject_id: b.subject_id, alpha_id: b.alpha_id,
    alpha_version_id: b.alpha_version_id, population: b.tuple_population_digest,
    partition: b.partition_digest, stages: [...b.stage_filter].sort(),
  }); });
  // Never select the newest/best result from ambiguous same-scope publications.
  return new Set(keys).size === keys.length ? accepted : [];
}
