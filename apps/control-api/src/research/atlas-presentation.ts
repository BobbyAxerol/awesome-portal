import type { ResearchEngineAtlasPrivate, ResearchEngineAtlasPublic } from "./foundation.contract";

/** Bump whenever this Portal-owned projection changes; it is not a manifest revision. */
export const RESEARCH_ATLAS_PRESENTATION_REVISION = "research.atlas-presentation.v2" as const;

/**
 * Codes name a known NOT_PUBLISHED slot. They do not explain why the engine
 * withheld a fact or establish certification/admission. The condition template
 * label likewise only names an existing source string. Preserve its original
 * reason/source and every other manifest fact; never fill an absent facts block.
 */
export function presentResearchAtlas(atlas: ResearchEngineAtlasPrivate): ResearchEngineAtlasPublic {
  return {
    ...atlas,
    modes: atlas.modes.map(mode => {
      if (!mode.facts) return mode;
      const facts = mode.facts;
      return {
        ...mode,
        facts: {
          ...facts,
          schedules: facts.schedules.map(schedule => ({
            ...schedule,
            ...(typeof schedule.oos_use_condition === "string"
              ? { oos_use_condition_code: "ATLAS_SOURCE_OOS_USE_CONDITION" as const } : {}),
            cert_cap: { ...schedule.cert_cap, reason_code: "ATLAS_CERT_CAP_NOT_PUBLISHED" as const },
          })),
          objective: facts.objective.state === "NOT_PUBLISHED"
            ? { ...facts.objective, reason_code: "ATLAS_OBJECTIVE_NOT_PUBLISHED" as const } : facts.objective,
          reads: facts.reads.state === "NOT_PUBLISHED"
            ? { ...facts.reads, reason_code: "ATLAS_READS_NOT_PUBLISHED" as const } : facts.reads,
          avoid_when: { ...facts.avoid_when, reason_code: "ATLAS_AVOID_WHEN_NOT_PUBLISHED" as const },
        },
      };
    }),
  };
}
