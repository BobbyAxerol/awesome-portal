import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

import { PortalUser } from "../domain";
import { type ResearchScope, ResearchMetadataError } from "./contracts";
import {
  RESEARCH_CURSOR_CODEC,
  RESEARCH_CURSOR_KEYS,
  type ResearchAtlasQuery,
  type ResearchAtlasResponse,
  type ResearchEngineAtlasPrivate,
  type ResearchInspectionCursor,
  type ResearchJourneyQuery,
  type ResearchJourneyResponse,
} from "./foundation.contract";
import { ResearchFoundationAtlasClient } from "./foundation.client";
import { ResearchFoundationError } from "./foundation.error";
import {
  RESEARCH_JOURNEY_DESCRIPTOR,
  RESEARCH_JOURNEY_DESCRIPTOR_ID,
  RESEARCH_JOURNEY_DESCRIPTOR_REVISION,
  RESEARCH_JOURNEY_DESCRIPTOR_SHA256,
  RESEARCH_JOURNEY_SCHEMA_VERSION,
} from "./journey.descriptor";
import { ResearchMetadataRepository } from "./repository";

@Injectable()
export class ResearchFoundationService {
  constructor(
    private readonly repository: ResearchMetadataRepository,
    private readonly atlasClient: ResearchFoundationAtlasClient,
  ) {}

  async journey(scope: ResearchScope, query: ResearchJourneyQuery): Promise<ResearchJourneyResponse> {
    const registry = await this.repository.loadJourneyDescriptor(scope);
    if (
      registry.descriptorId !== RESEARCH_JOURNEY_DESCRIPTOR_ID ||
      registry.schemaVersion !== RESEARCH_JOURNEY_SCHEMA_VERSION ||
      registry.revision !== RESEARCH_JOURNEY_DESCRIPTOR_REVISION ||
      registry.contentSha256 !== RESEARCH_JOURNEY_DESCRIPTOR_SHA256
    ) {
      throw new ResearchFoundationError(
        "RESEARCH_FOUNDATION_DESCRIPTOR_MISMATCH",
        "Research Journey descriptor revision is not compatible with this Portal release.",
        503,
      );
    }
    const inspection = await this.inspection(scope, query);
    return {
      schema_version: "research.journey-response.v1",
      descriptor: {
        schema_version: RESEARCH_JOURNEY_DESCRIPTOR.schema_version,
        descriptor_id: RESEARCH_JOURNEY_DESCRIPTOR.descriptor_id,
        revision: RESEARCH_JOURNEY_DESCRIPTOR.revision,
        content_sha256: registry.contentSha256,
        phases: RESEARCH_JOURNEY_DESCRIPTOR.phases,
      },
      inspection,
      etag: this.etag("journey", `${registry.revision}:${registry.contentSha256}:${inspection.canonical_query}`),
    };
  }

  async atlas(user: PortalUser, query: ResearchAtlasQuery): Promise<ResearchAtlasResponse> {
    const atlas = await this.atlasClient.read(user);
    const selected = this.selectAtlasRelease(atlas, query.release_id);
    if (query.route && !atlas.routes.some((route) => route.route_id === query.route)) {
      throw new ResearchFoundationError(
        "RESEARCH_FOUNDATION_ROUTE_NOT_FOUND",
        "The requested Engine Atlas route is not published by this manifest.",
        404,
      );
    }
    if (query.mode && !atlas.modes.some((mode) => mode.mode_id === query.mode)) {
      throw new ResearchFoundationError(
        "RESEARCH_FOUNDATION_CAPABILITY_NOT_FOUND",
        "The requested Engine Atlas mode is not published by this manifest.",
        404,
      );
    }
    return {
      schema_version: "research.engine-atlas-response.v1",
      selected_release_id: selected.releaseId,
      selected_release_kind: selected.kind,
      atlas,
      etag: this.etag(
        "atlas",
        `${atlas.manifest_revision}:${selected.releaseId}:${query.route ?? ""}:${query.mode ?? ""}`,
      ),
    };
  }

  private async inspection(scope: ResearchScope, query: ResearchJourneyQuery): Promise<ResearchInspectionCursor> {
    const cursor: Partial<Record<(typeof RESEARCH_CURSOR_KEYS)[number], string>> = {};
    const cursorQuery = query as ResearchJourneyQuery & Partial<Record<(typeof RESEARCH_CURSOR_KEYS)[number], string>>;
    for (const key of RESEARCH_CURSOR_KEYS) {
      const value = cursorQuery[key];
      if (typeof value === "string") cursor[key] = value;
    }
    // P02 treats event_seq as a legacy alias.  They can coexist only if they
    // name the exact same opaque event.  The canonical URL has one `seq`.
    if (cursor.seq && cursor.event_seq && cursor.seq !== cursor.event_seq) {
      throw new ResearchFoundationError(
        "RESEARCH_FOUNDATION_INVALID",
        "seq and event_seq must identify the same inspection event.",
        400,
      );
    }
    if (!cursor.seq && cursor.event_seq) cursor.seq = cursor.event_seq;
    delete cursor.event_seq;

    let ambiguityState: ResearchInspectionCursor["ambiguity_state"] = "NOT_APPLICABLE";
    if (cursor.trial && !cursor.study) {
      if (query.run_id) {
        if (await this.repository.isTrialAmbiguous(scope, query.run_id, cursor.trial)) {
          throw new ResearchFoundationError(
            "RESEARCH_FOUNDATION_CURSOR_STUDY_REQUIRED",
            "This trial identifier is ambiguous in the scoped run; include study.",
            409,
          );
        }
        ambiguityState = "RESOLVED";
      } else {
        ambiguityState = "UNRESOLVED_NO_RUN_CONTEXT";
      }
    }
    const params = new URLSearchParams();
    if (query.run_id) params.set("run_id", query.run_id);
    for (const key of RESEARCH_CURSOR_KEYS) {
      if (key === "event_seq") continue;
      const value = cursor[key];
      if (value) params.set(key, value);
    }
    return {
      cursor,
      canonical_query: params.size > 0 ? `?${params.toString()}` : "",
      codec: RESEARCH_CURSOR_CODEC,
      pick_effect: "INSPECTION_ONLY",
      ambiguity_state: ambiguityState,
    };
  }

  private selectAtlasRelease(
    atlas: ResearchEngineAtlasPrivate,
    requestedReleaseId: string | undefined,
  ): { releaseId: string; kind: "CURRENT" | "HISTORICAL" } {
    if (!requestedReleaseId || requestedReleaseId === atlas.current_release.release_id) {
      return { releaseId: atlas.current_release.release_id, kind: "CURRENT" };
    }
    if (atlas.historical_releases.some((release) => release.release_id === requestedReleaseId)) {
      return { releaseId: requestedReleaseId, kind: "HISTORICAL" };
    }
    throw new ResearchFoundationError(
      "RESEARCH_FOUNDATION_RELEASE_NOT_FOUND",
      "The requested Engine Atlas release is not retained by this manifest.",
      404,
    );
  }

  private etag(namespace: string, value: string): string {
    const digest = createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
    return `W/\"research-${namespace}-${digest}\"`;
  }
}

/** Keep repository/private-adapter details behind one same-origin vocabulary. */
export function asResearchFoundationError(error: unknown): never {
  if (error instanceof ResearchFoundationError) throw error;
  if (error instanceof ResearchMetadataError) {
    if (error.code === "RESEARCH_DB_ROLE_UNAVAILABLE" || error.code === "RESEARCH_ADMISSION_SATURATED") {
      throw new ResearchFoundationError("RESEARCH_FOUNDATION_UNAVAILABLE", "Research foundation is temporarily unavailable.", 503);
    }
    throw new ResearchFoundationError("RESEARCH_FOUNDATION_NOT_FOUND", "Research workspace data was not found.", 404);
  }
  throw error;
}
