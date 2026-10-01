/** One bounded projection for the S03/S04 methodology strip. */
import { Injectable } from "@nestjs/common";
import { z } from "zod";

import type { PortalUser } from "../domain";
import type { ResearchScope } from "./contracts";
import { CurrentSourceFactsSchema } from "./current-source.payload";
import { ResearchCurrentSourceRepository } from "./current-source.repository";
import type { ResearchEngineAtlasPrivate } from "./foundation.contract";
import { ResearchFoundationAtlasClient } from "./foundation.client";

const ClaimKindSchema = z.enum(["VALIDATION", "CHRONOLOGY", "CAUSALITY", "OOS_SELECTION", "HOLDOUT_STATE", "EXECUTION_CONTRACT", "RUNTIME_AUTHORITY"]);
export const MethodologyClaimSchema = z.discriminatedUnion("state", [
  z.object({ kind: ClaimKindSchema, state: z.literal("FORECAST"),
    text: z.string().min(1).max(191), reason_code: z.null(), source: z.literal("ATLAS_MODE_SCHEDULE") }).strict(),
  z.object({ kind: ClaimKindSchema, state: z.literal("ISSUED"),
    text: z.string().min(1).max(191), reason_code: z.null(), source: z.literal("SEALED_QUANTBT_CLAIM") }).strict(),
  z.object({ kind: ClaimKindSchema, state: z.literal("NOT_PUBLISHED"),
    text: z.null(), reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/), source: z.null() }).strict(),
  z.object({ kind: ClaimKindSchema, state: z.literal("NOT_APPLICABLE"),
    text: z.null(), reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/), source: z.null() }).strict(),
]);
export type MethodologyClaim = z.infer<typeof MethodologyClaimSchema>;

const KINDS = ["VALIDATION", "CHRONOLOGY", "CAUSALITY", "OOS_SELECTION"] as const;
type Kind = typeof KINDS[number];
type ClaimText = Partial<Record<Kind, string>>;
type ClaimIdentity = { releaseId: string | null; mode: string | null; schedule: string | null; routeId?: string | null };

/** Exact catalog pair only. A current catalog must never describe a historical engine run. */
function forecast(atlas: ResearchEngineAtlasPrivate | null, releaseId: string | null, mode: string | null, schedule: string | null): ClaimText {
  if (!atlas || releaseId !== atlas.current_release.release_id || !mode || !schedule) return {};
  const pair = atlas.modes.find((item) => item.mode_id === mode)?.facts?.schedules.find((item) => item.schedule === schedule);
  if (!pair) return {};
  return {
    VALIDATION: pair.validation_claim,
    CHRONOLOGY: pair.chronological_validation_claim,
    CAUSALITY: pair.causality_claim,
    OOS_SELECTION: pair.oos_use,
  };
}

function issued(summary: Record<string, unknown> | null): ClaimText {
  const factBlock = summary?.source_facts;
  const parsed = CurrentSourceFactsSchema.safeParse(factBlock);
  const claims = parsed.success ? parsed.data.claims : undefined;
  if (!claims) return {};
  return {
    ...(claims.validation_claim ? { VALIDATION: claims.validation_claim } : {}),
    ...(claims.chronological_validation_claim ? { CHRONOLOGY: claims.chronological_validation_claim } : {}),
    ...(claims.causality_claim ? { CAUSALITY: claims.causality_claim } : {}),
    ...(claims.oos_used_for_selection === null ? {} : { OOS_SELECTION: claims.oos_used_for_selection ? "USED" : "NOT_USED" }),
  };
}

export function projectMethodologyClaims(
  atlas: ResearchEngineAtlasPrivate | null,
  summary: Record<string, unknown> | null,
  identity: ClaimIdentity,
): MethodologyClaim[] {
  const forecasts = forecast(atlas, identity.releaseId, identity.mode, identity.schedule);
  const issuedFacts = issued(summary);
  return KINDS.map((kind) => {
    const sourceText = issuedFacts[kind];
    if (sourceText) return { kind, state: "ISSUED", text: sourceText, reason_code: null, source: "SEALED_QUANTBT_CLAIM" };
    const forecastText = forecasts[kind];
    if (forecastText) return { kind, state: "FORECAST", text: forecastText, reason_code: null, source: "ATLAS_MODE_SCHEDULE" };
    return { kind, state: "NOT_PUBLISHED", text: null, reason_code: "METHODOLOGY_CLAIM_NOT_PUBLISHED_FOR_RUN", source: null };
  });
}

/** S04’s seven-cell strip. Extra cells are never promoted by the P11 singular claim. */
export function projectEvidenceClaimStrip(
  atlas: ResearchEngineAtlasPrivate | null,
  summary: Record<string, unknown> | null,
  identity: ClaimIdentity,
): MethodologyClaim[] {
  const four = new Map(projectMethodologyClaims(atlas, summary, identity).map((claim) => [claim.kind, claim]));
  const parsed = CurrentSourceFactsSchema.safeParse(summary?.source_facts);
  const execution = parsed.success ? parsed.data.execution : null;
  const route = atlas && identity.releaseId === atlas.current_release.release_id && identity.routeId
    ? atlas.routes.find((item) => item.route_id === identity.routeId) : null;
  const missing = (kind: MethodologyClaim["kind"], reason_code: string): MethodologyClaim =>
    ({ kind, state: "NOT_PUBLISHED", text: null, reason_code, source: null });
  const holdout: MethodologyClaim = parsed.success
    ? { kind: "HOLDOUT_STATE", state: "NOT_APPLICABLE", text: null,
      reason_code: "P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT", source: null }
    : missing("HOLDOUT_STATE", "P04_HOLDOUT_SEAL_NOT_IN_EVIDENCE_HUB");
  const engineId = execution?.engine_id;
  const executionContract: MethodologyClaim = engineId
    ? { kind: "EXECUTION_CONTRACT", state: "ISSUED", text: engineId,
      reason_code: null, source: "SEALED_QUANTBT_CLAIM" }
    : route
      ? { kind: "EXECUTION_CONTRACT", state: "FORECAST", text: route.execution_contract,
        reason_code: null, source: "ATLAS_MODE_SCHEDULE" }
      : missing("EXECUTION_CONTRACT", "EXECUTION_CONTRACT_NOT_PUBLISHED_FOR_RUN");
  const backend = execution?.final_account_backend;
  const runtimeAuthority: MethodologyClaim = backend
    ? { kind: "RUNTIME_AUTHORITY", state: "ISSUED", text: backend,
      reason_code: null, source: "SEALED_QUANTBT_CLAIM" }
    : missing("RUNTIME_AUTHORITY", "RUNTIME_AUTHORITY_NOT_PUBLISHED_FOR_RUN");
  return [
    four.get("VALIDATION")!, four.get("CHRONOLOGY")!, four.get("OOS_SELECTION")!,
    holdout, four.get("CAUSALITY")!, executionContract, runtimeAuthority,
  ];
}

@Injectable()
export class ResearchMethodologyClaimsService {
  private readonly atlasCache = new Map<string, { until: number; value: ResearchEngineAtlasPrivate }>();

  constructor(
    private readonly atlas: ResearchFoundationAtlasClient,
    private readonly retained: ResearchCurrentSourceRepository,
  ) {}

  async read(user: PortalUser, scope: ResearchScope, runId: string, identity: ClaimIdentity,
    completed: boolean, screen: "PROGRESS" | "EVIDENCE" = "PROGRESS"): Promise<MethodologyClaim[]> {
    // A short per-principal cache bounds the private Atlas cost during five-second
    // progress polling. It is never an authorization cache: the caller has
    // already passed the run-scoped DB read and the Atlas principal is rebuilt
    // on a miss. Failures are not cached.
    const key = `${user.userId}:${user.role}`;
    const cached = this.atlasCache.get(key);
    let atlas: ResearchEngineAtlasPrivate | null = cached && cached.until > Date.now() ? cached.value : null;
    if (!atlas) {
      try {
        atlas = await this.atlas.read(user);
        if (this.atlasCache.size >= 128) this.atlasCache.clear();
        this.atlasCache.set(key, { until: Date.now() + 30_000, value: atlas });
      } catch { atlas = null; }
    }
    let summary: Record<string, unknown> | null = null;
    if (completed) {
      // A sealed WFO source can issue facts. P04's singular P11 claim cannot
      // be expanded into four issued claims; absent seal stays forecast/typed.
      try { summary = (await this.retained.sealForRead(scope, runId))?.summary ?? null; }
      catch { summary = null; }
    }
    return screen === "EVIDENCE" ? projectEvidenceClaimStrip(atlas, summary, identity)
      : projectMethodologyClaims(atlas, summary, identity);
  }
}
