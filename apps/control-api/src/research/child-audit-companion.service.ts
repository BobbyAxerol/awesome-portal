import { Inject, Injectable } from "@nestjs/common";
import { querySigningKeys, type ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { KeysetCursorCodec } from "../query";
import type { ResearchScope } from "./contracts";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchCurrentSourceError } from "./current-source.error";
import { ResearchChildAuditCompanionRepository } from "./child-audit-companion.repository";
import { ChildAuditCompanionQuerySchema, ChildAuditCompanionPageSchema } from "./child-audit-companion.contract";

@Injectable()
export class ResearchChildAuditCompanionService {
  private readonly cursors: KeysetCursorCodec;
  constructor(@Inject(ResearchChildAuditCompanionRepository) private readonly repository: ResearchChildAuditCompanionRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {
    this.cursors = new KeysetCursorCodec({activeKeyId:config.QUERY_CURSOR_ACTIVE_KEY_ID,keys:querySigningKeys(config),ttlSeconds:config.QUERY_CURSOR_TTL_SECONDS});
  }
  async page(scope: ResearchScope, runId: string, raw: unknown, signal?: AbortSignal) {
    if (this.config.FEATURE_RESEARCH_CURRENT_SOURCE !== "true")
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE","Retained audit reads are not enabled.",503);
    const parsed = ChildAuditCompanionQuerySchema.safeParse(raw);
    if (!parsed.success || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)
      || parsed.data.workspace_id !== undefined && parsed.data.workspace_id !== scope.workspaceId)
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID","Invalid audit companion query.",400);
    const query = parsed.data, resourceId = `child-audit-companion:${runId}`;
    const fingerprint = (revision:string|null) => sha256ResearchJson({revision,runId,workspace:scope.workspaceId,actor:scope.actorUserId,
      fold:query.fold_id ?? null,context:query.context ?? null,ordinal:query.audit_ordinal ?? null,limit:query.limit});
    const result = await this.repository.page(scope,runId,query,revision => {
      if (!query.cursor) return undefined;
      try {
        const [value] = this.cursors.decode(query.cursor,{resourceId,workspaceId:scope.workspaceId,direction:"after",queryFingerprint:fingerprint(revision),boundarySize:1});
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= 20000) throw new Error("invalid boundary");
        return value;
      } catch (error) {
        const expired = typeof error === "object" && error !== null && "code" in error && error.code === "CURSOR_EXPIRED";
        throw new ResearchCurrentSourceError(expired ? "RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED" : "RESEARCH_CURRENT_SOURCE_INVALID","Audit cursor does not match this immutable page.",400);
      }
    },signal);
    const available = result.manifest !== null;
    const cursor = result.hasMore ? this.cursors.encode({resource_id:resourceId,workspace_id:scope.workspaceId,direction:"after",
      query_fingerprint:fingerprint(result.revision),boundary:[result.rows.at(-1)!.audit_ordinal]}) : null;
    const page = ChildAuditCompanionPageSchema.parse({schema_version:"research.child-audit-companion-page.v1",run_id:runId,
      availability:{state:available ? "AVAILABLE" : "NOT_PUBLISHED",reason_code:available ? null : result.legacy.sourceCount !== null ? "LEGACY_SAMPLE" : "SOURCE_AUDIT_NOT_RETAINED"},
      custody:available ? "FULL_SOURCE_RETAINED" : result.legacy.sourceCount !== null ? "LEGACY_SAMPLE" : "NOT_RETAINED",
      revision:result.revision,manifest:result.manifest,scope:"SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK",
      counts:{full_source_retained:result.manifest?.source_record_count ?? null,
        records_dropped_by_source:result.manifest ? result.manifest.records_dropped_by_source : result.legacy.dropped,
        source_total_if_known:result.manifest ? result.manifest.source_total_count : result.legacy.sourceCount !== null && result.legacy.dropped !== null
          ? result.legacy.sourceCount+result.legacy.dropped : null,
        matching_fold:result.matchingFold,matching_filter:result.matchingFilter,legacy_sample_retained:result.legacy.samples,returned:result.rows.length},
      rows:result.rows,next_cursor:cursor});
    if (Buffer.byteLength(JSON.stringify(page)) > 1_048_576)
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE","Audit page exceeds its response bound.",503);
    return page;
  }
}
