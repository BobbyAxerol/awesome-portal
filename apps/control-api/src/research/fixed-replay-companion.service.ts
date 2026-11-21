import { Inject, Injectable } from "@nestjs/common";
import { querySigningKeys, type ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { KeysetCursorCodec } from "../query";
import type { ResearchScope } from "./contracts";
import { ResearchReplayError } from "./replay.error";
import { sha256ResearchJson } from "./preflight.service";
import { FixedReplayCompanionQuerySchema, FixedReplayCompanionPageSchema, FIXED_REPLAY_SCOPE, FIXED_REPLAY_MAX_WIRE_BYTES,isFixedReplayProfile } from "./fixed-replay-companion.contract";
import { ResearchFixedReplayCompanionRepository } from "./fixed-replay-companion.repository";

@Injectable()
export class ResearchFixedReplayCompanionService {
  private readonly cursors:KeysetCursorCodec;
  constructor(@Inject(ResearchFixedReplayCompanionRepository) private readonly repository:ResearchFixedReplayCompanionRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config:ControlApiConfig) {
    this.cursors=new KeysetCursorCodec({activeKeyId:config.QUERY_CURSOR_ACTIVE_KEY_ID,keys:querySigningKeys(config),ttlSeconds:config.QUERY_CURSOR_TTL_SECONDS});
  }
  async observations(scope:ResearchScope,runId:string,raw:unknown,signal?:AbortSignal) {
    if(this.config.FEATURE_RESEARCH_REPLAY!=="true") throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE","Retained replay reads are not enabled.",503);
    const parsed=FixedReplayCompanionQuerySchema.safeParse(raw);
    if(!parsed.success || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)
      || parsed.data.workspace_id!==undefined && parsed.data.workspace_id!==scope.workspaceId)
      throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Invalid fixed OOS observation query.",400);
    const query=parsed.data,resourceId=`fixed-replay-observations:${runId}`;
    const fingerprint=(revision:string|null)=>sha256ResearchJson({workspace:scope.workspaceId,actor:scope.actorUserId,runId,revision,
      limit:query.limit,ordinal:query.source_ordinal ?? null});
    const result=await this.repository.page(scope,runId,query,revision=>{
      if(!query.cursor) return undefined;
      try {
        const [value]=this.cursors.decode(query.cursor,{resourceId,workspaceId:scope.workspaceId,direction:"after",queryFingerprint:fingerprint(revision),boundarySize:1});
        if(typeof value!=="number" || !Number.isInteger(value) || value<0 || value>=20_000) throw new Error("invalid boundary");
        return value;
      } catch(error) {
        const expired=typeof error==="object" && error!==null && "code" in error && error.code==="CURSOR_EXPIRED";
        throw new ResearchReplayError(expired ? "RESEARCH_REPLAY_CURSOR_EXPIRED" : "RESEARCH_REPLAY_CURSOR_INVALID","Replay cursor does not match this immutable page.",400);
      }
    },signal);
    const source=result.manifest?.source,available=source?.state==="AVAILABLE";
    const executionProfile=result.executionProfile ?? {id:result.manifest?.execution_profile_id ?? null,digest:result.manifest?.execution_profile_digest ?? null};
    const applicable=executionProfile.id===null || isFixedReplayProfile(executionProfile.id,executionProfile.digest);
    const cursor=result.hasMore ? this.cursors.encode({resource_id:resourceId,workspace_id:scope.workspaceId,direction:"after",
      query_fingerprint:fingerprint(result.revision),boundary:[result.rows.at(-1)!.source_ordinal]}) : null;
    const page=FixedReplayCompanionPageSchema.parse({schema_version:"research.fixed-replay-companion-page.v1",run_id:runId,
      availability:{state:!applicable ? "NOT_APPLICABLE" : available ? "AVAILABLE" : "NOT_PUBLISHED",reason_code:!applicable ? "EXECUTION_PROFILE_NOT_FIXED" : available ? null : source?.reason_code
        ?? (result.pending ? "FIXED_OOS_RETENTION_NOT_FINALIZED" : "FIXED_OOS_CUSTODY_NOT_RECORDED")},
      custody:!applicable ? "NOT_APPLICABLE" : available ? "FRESH_FIXED_OOS_RETAINED" : source ? "FRESH_SOURCE_NOT_PUBLISHED" : result.pending ? "NOT_FINALIZED" : "NOT_RECORDED",
      execution_profile:executionProfile,scope:FIXED_REPLAY_SCOPE,revision:result.revision,manifest:result.manifest,
      counts:{full_source_retained:source?.state==="AVAILABLE" ? source.row_count : null,matching_filter:result.matchingFilter,returned:result.rows.length},
      rows:result.rows,next_cursor:cursor});
    if(Buffer.byteLength(JSON.stringify(page))>FIXED_REPLAY_MAX_WIRE_BYTES)
      throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE","Replay page exceeds its bounded response.",503);
    return page;
  }
}
