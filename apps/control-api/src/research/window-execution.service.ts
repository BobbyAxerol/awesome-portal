import {Inject,Injectable} from "@nestjs/common";
import {CONTROL_API_CONFIG} from "../tokens";
import {querySigningKeys,type ControlApiConfig} from "../config";
import {KeysetCursorCodec} from "../query";
import type {ResearchScope} from "./contracts";
import type {ProgressIngressScope} from "./progress.repository";
import {ResearchReplayError} from "./replay.error";
import {sha256ResearchJson} from "./preflight.service";
import {ResearchWindowExecutionRepository} from "./window-execution.repository";
import {WindowExecutionBatchSchema,WindowExecutionSealSchema,WindowExecutionQuerySchema,WindowExecutionPageSchema,
  type WindowExecutionManifest,type WindowExecutionBatch,type WindowExecutionSeal,type WindowExecutionQuery} from "./window-execution.contract";

@Injectable()
export class ResearchWindowExecutionService {
  private readonly cursors:KeysetCursorCodec;
  constructor(@Inject(ResearchWindowExecutionRepository)private readonly repo:ResearchWindowExecutionRepository,
    @Inject(CONTROL_API_CONFIG)private readonly config:ControlApiConfig){
    this.cursors=new KeysetCursorCodec({activeKeyId:config.QUERY_CURSOR_ACTIVE_KEY_ID,keys:querySigningKeys(config),ttlSeconds:config.QUERY_CURSOR_TTL_SECONDS});
  }
  async ingest(lease:ProgressIngressScope,raw:unknown,seal=false){
    const parsed=seal?WindowExecutionSealSchema.safeParse(raw):WindowExecutionBatchSchema.safeParse(raw);
    if(!parsed.success)throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Invalid bounded window execution ingress.",400);
    const v=parsed.data;
    if(v.workspace_id!==lease.workspaceId||v.job_id!==lease.jobId||v.worker_attempt_id!==lease.workerAttemptId||v.lease_epoch!==lease.leaseEpoch)
      throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Window execution lease does not match.",409);
    const scope={workspaceId:lease.workspaceId,actorUserId:lease.actorUserId};
    if(seal){const result=await this.repo.seal(scope,v as WindowExecutionSeal);return {state:result.replayed?"REPLAYED":"SEALED",companion_digest:v.companion_digest};}
    const input=v as WindowExecutionBatch,result=await this.repo.append(scope,input);
    return {state:result.replayed?"REPLAYED":"ACCEPTED",row_count:input.rows.length,batch_ordinal:input.batch_ordinal};
  }
  async read(scope:ResearchScope,runId:string,raw:unknown,kind:"OBSERVATION"|"ANALYTICS"|"EXECUTION",signal?:AbortSignal){
    if(this.config.FEATURE_RESEARCH_REPLAY!=="true")throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE","Window execution reads are not enabled.",503);
    const parsed=WindowExecutionQuerySchema.safeParse(raw);
    if(!parsed.success||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)
      ||parsed.data.workspace_id!==undefined&&parsed.data.workspace_id!==scope.workspaceId
      ||kind!=="EXECUTION"&&parsed.data.record_kind!==undefined
      ||kind==="ANALYTICS"&&(parsed.data.cursor!==undefined||parsed.data.at_utc_ms!==undefined))
      throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Invalid window execution query.",400);
    const query={...parsed.data,...(kind==="ANALYTICS"?{limit:1}:{})};
    const resourceId=`window-execution:${kind}:${runId}`;
    const fingerprint=(revision:string|null)=>sha256ResearchJson({workspace:scope.workspaceId,actor:scope.actorUserId,runId,kind,revision,
      window:query.window,fold_id:query.fold_id??null,limit:query.limit,at:query.at_utc_ms??null,record:query.record_kind??null});
    const result=await this.repo.page(scope,runId,query,kind,revision=>{
      if(!query.cursor)return undefined;
      try{
        const [v]=this.cursors.decode(query.cursor,{resourceId,workspaceId:scope.workspaceId,direction:"after",queryFingerprint:fingerprint(revision),boundarySize:1});
        if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0||v>=200_000)throw new Error("invalid boundary");return v;
      }catch(e){throw new ResearchReplayError("RESEARCH_REPLAY_CURSOR_INVALID","Cursor does not match this actor, window, filter or source revision.",400);}
    },signal);
    const descriptor=result.manifest?.source.windows.find(w=>w.window===query.window&&w.fold_id===(query.fold_id??null))??null;
    const journal=result.manifest?.source.execution_availability;
    const journalState=kind!=="EXECUTION"||descriptor?.availability.state!=="AVAILABLE"?undefined:
      query.record_kind?journal?.[query.record_kind]??{state:"NOT_PUBLISHED" as const,reason_code:"ENGINE_EXECUTION_RELATION_NOT_PUBLISHED"}:
      journal&&Object.values(journal).some(v=>v.state==="AVAILABLE")?{state:"AVAILABLE" as const,reason_code:null}:
      {state:"NOT_APPLICABLE" as const,reason_code:"SOURCE_ROUTE_HAS_NO_NATIVE_EXECUTION_JOURNAL"};
    const state=journalState?.state??descriptor?.availability.state??"NOT_PUBLISHED";
    let rows=result.rows,next=null as string|null;
    if(result.hasMore)next=this.cursors.encode({resource_id:resourceId,workspace_id:scope.workspaceId,direction:"after",query_fingerprint:fingerprint(result.revision),boundary:[rows.at(-1)!.source_ordinal]});
    // Variable byte truncation uses the SAME source ordinal cursor; no hidden
    // skipped rows. The first oversized DTO fails closed instead of lying empty.
    const reason=journalState?.reason_code??descriptor?.availability.reason_code??(state==="AVAILABLE"?null:result.pending?"RUN_NOT_COMPLETED_WINDOW_PROTECTED":result.manifest?"WINDOW_OR_FOLD_NOT_RETAINED":"HISTORICAL_WINDOW_EXECUTION_CUSTODY_NOT_RECORDED");
    const body=()=>({schema_version:"research.window-execution-page.v1" as const,run_id:runId,
      availability:{state,reason_code:reason},revision:result.revision,window:query.window,fold_id:query.fold_id??null,descriptor,
      counts:{matching:state==="AVAILABLE"?result.matching:null,returned:rows.length},rows,next_cursor:next,
      authority:"COMPLETED_RETAINED_ACCOUNT_AND_ENGINE_AUDIT_NOT_BROKER_HISTORY" as const});
    while(Buffer.byteLength(JSON.stringify(body()))>1_000_000&&rows.length>1){
      rows=rows.slice(0,-1);next=this.cursors.encode({resource_id:resourceId,workspace_id:scope.workspaceId,direction:"after",query_fingerprint:fingerprint(result.revision),boundary:[rows.at(-1)!.source_ordinal]});
    }
    if(Buffer.byteLength(JSON.stringify(body()))>1_000_000)throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE","Window execution page exceeds its bounded response.",503);
    return WindowExecutionPageSchema.parse(body());
  }
  async compare(scope:ResearchScope,runs:[string,string],query:WindowExecutionQuery,signal?:AbortSignal){
    if(this.config.FEATURE_RESEARCH_COMPARE!=="true")throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE","Window comparison is not enabled.",503);
    if(runs[0]===runs[1])throw new ResearchReplayError("RESEARCH_REPLAY_INVALID","Compare requires two distinct runs.",400);
    const pages=await Promise.all(runs.map(id=>this.read(scope,id,{workspace_id:scope.workspaceId,window:query.window,fold_id:query.fold_id},"ANALYTICS",signal)));
    const analyses=pages.map(p=>p.rows.find(r=>r.kind==="ANALYTICS")?.payload??null);
    const correlation={state:"NOT_PUBLISHED" as "AVAILABLE"|"NOT_PUBLISHED"|"NOT_APPLICABLE",
      reason_code:"WINDOW_COMPARE_SOURCE_NOT_RETAINED" as string|null,value:null as string|null,
      matched_observation_count:null as number|null,basis:"EXACT_SHARED_UTC_MS_RETURN_FRACTIONS_NO_FORWARD_FILL" as const};
    if(analyses.every(a=>a!==null)) {
      // Manifest identity is re-read and pinned before the local SQL aggregate;
      // never correlate the extrema display curves or mix window scopes.
      const manifests=await Promise.all(runs.map(id=>this.repo.page(scope,id,{...query,limit:1},"ANALYTICS",()=>undefined,signal)));
      if(manifests.every((p,i)=>p.manifest&&p.revision===pages[i]!.revision)) {
        const c=await this.repo.correlation(scope,manifests.map(p=>p.manifest!) as [WindowExecutionManifest,WindowExecutionManifest],query,signal);
        correlation.matched_observation_count=c.matched;
        if(c.matched>=3&&c.value!==null&&Number.isFinite(c.value)) {
          correlation.state="AVAILABLE";correlation.reason_code=null;
          // Bounded decimal formatting; no exponent transport or bogus zero.
          correlation.value=c.value===0?"0":c.value.toLocaleString("en-US",{useGrouping:false,maximumSignificantDigits:17});
        } else {correlation.state="NOT_APPLICABLE";correlation.reason_code=c.matched<3?"WINDOW_COMPARE_INSUFFICIENT_COMMON_TIMESTAMPS":"WINDOW_COMPARE_CONSTANT_RETURN_SERIES";}
      }
    }
    return {schema_version:"research.window-compare.v1",window:query.window,fold_id:query.fold_id??null,
      basis:"ALL_TIME_FULL_RETAINED_WINDOW" as const,alignment:"INDEPENDENT_ACCOUNT_WINDOWS_NOT_FORWARD_FILLED" as const,
      runs:pages.map((p,i)=>({run_id:runs[i],availability:p.availability,revision:p.revision,descriptor:p.descriptor,analysis:analyses[i]})),
      revision:sha256ResearchJson({scope,window:query.window,fold:query.fold_id??null,pages}),
      correlation};
  }
  async navigation(scope:ResearchScope,runId:string,signal?:AbortSignal){
    if(this.config.FEATURE_RESEARCH_REPLAY!=="true")return undefined;
    const value=await this.repo.page(scope,runId,WindowExecutionQuerySchema.parse({window:"HOLDOUT",limit:1}),"ANALYTICS",()=>undefined,signal);
    return value.manifest?.source;
  }
}
