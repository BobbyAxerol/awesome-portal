/** Adapt existing immutable service fixtures to the repository's finite S06 bundle. */
import { vi } from "vitest";
import { ResearchCurrentSourceError } from "../src/research/current-source.error";
import type { CurrentSourceSealRow, CurrentSourcePage } from "../src/research/current-source.repository";
import type { ResearchScope } from "../src/research/contracts";
import { p11StageEvents, type P11StageEvents } from "../src/research/p11-stage-events";

export function mockSearchRepository(repository: Record<string, unknown>) {
  const stageEventClocks = repository.stageEventClocks as ((...args: unknown[]) => Promise<P11StageEvents>) | undefined
    ?? vi.fn().mockResolvedValue(p11StageEvents());
  const searchInputs = vi.fn(async (scope: ResearchScope, seal: CurrentSourceSealRow) => {
    const read = repository.rows as (...args: unknown[]) => Promise<CurrentSourcePage>;
    const relations = {} as Record<"TRIAL" | "CANDIDATE" | "FOLD", CurrentSourcePage["rows"]>;
    for (const [kind, limit] of [["TRIAL", 400], ["CANDIDATE", 64], ["FOLD", 256]] as const) {
      const page = await read(scope, seal.runId, seal.artifactRevision, kind, { limit });
      if (page.hasMore || page.hasPrevious || page.totalRows !== seal.tableRows[kind] || page.rows.length > limit) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained search relation exceeds its sealed bound.", 503);
      }
      relations[kind] = page.rows;
    }
    const request = repository.admittedRequestedSpec as ((...args: unknown[]) => Promise<Record<string, unknown> | null>) | undefined;
    return { trials: relations.TRIAL, candidates: relations.CANDIDATE, folds: relations.FOLD,
      stageEvents: await stageEventClocks(scope, seal),
      requestedSpec: request ? await request(scope, seal.runId, seal.requestedSpecDigest) : null };
  });
  return { ...repository, stageEventClocks, searchInputs, searchForRead: vi.fn(async (scope: ResearchScope, runId: string) => {
    const getSeal = repository.sealForRead as (...args: unknown[]) => Promise<CurrentSourceSealRow | null>;
    const seal = await getSeal(scope, runId);
    return seal ? { seal, inputs: await searchInputs(scope, seal) } : null;
  }) };
}
