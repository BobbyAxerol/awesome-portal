/** Preparation is a terminal/ops write. Public readers use only the local sidecar. */
import {Inject,Injectable} from "@nestjs/common";
import {PrincipalService} from "../auth/principal";
import {CONTROL_API_CONFIG} from "../tokens";
import {querySigningKeys,type ControlApiConfig} from "../config";
import {KeysetCursorCodec} from "../query";
import type {ResearchScope} from "./contracts";
import {NativeCustodySchema,NativeSearchSchema,NativeFreezeSchema} from "./native-read.contract";
import {ResearchNativeReadRepository,type NativeStoredRead,type NativeBinding} from "./native-read.repository";
import {ResearchReportError} from "./report.error";
import {ResearchSearchError} from "./search.error";
import {sha256ResearchJson} from "./preflight.service";
@Injectable()
export class ResearchNativeReadService {
  private readonly cursors:KeysetCursorCodec;
  constructor(private readonly repository:ResearchNativeReadRepository,@Inject(CONTROL_API_CONFIG)private readonly config:ControlApiConfig){
    this.cursors=new KeysetCursorCodec({activeKeyId:config.QUERY_CURSOR_ACTIVE_KEY_ID,keys:querySigningKeys(config),ttlSeconds:config.QUERY_CURSOR_TTL_SECONDS});
  }
  read(scope:ResearchScope,runId:string){return this.repository.read(scope,runId);}
  async prepare(scope:ResearchScope,runId:string):Promise<NativeStoredRead|null>{
    const binding=await this.repository.binding(scope,runId);if(!binding)return null;
    // Revalidate bytes even on an explicit retry; existing sidecar pins cannot
    // turn disk corruption into a successful new observation.
    return this.repository.store(scope,await this.observe(scope,binding));
  }
  private async observe(scope:ResearchScope,binding:NativeBinding){
    if(!this.config.INTERNAL_PRINCIPAL_SECRET)throw new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE","Native preparation is not configured.",503);
    const principal=new PrincipalService(this.config.INTERNAL_PRINCIPAL_SECRET).sign({principalId:scope.actorUserId,
      username:"research-native-read",role:"ADMIN",accessSubject:null,accessEmail:null,authnMethods:["portal_session","research_native_read_prepare"],
      sessionId:"research-native-read",mustChangePassword:false,issuedAt:new Date().toISOString()});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.config.RESEARCH_PREFLIGHT_TIMEOUT_MS);
    try{
      const response=await fetch(new URL("/internal/research/native-read/prepare",this.config.PORTAL_API_BASE_URL),{
        method:"POST",headers:{"content-type":"application/json","x-portal-principal":principal},body:JSON.stringify(binding),
        signal:controller.signal,redirect:"manual"});
      if(!response.ok||!response.body)throw new Error("private preparation refused");
      const reader=response.body.getReader();let n=0;const chunks:Uint8Array[]=[];
      for(;;){const next=await reader.read();if(next.done)break;n+=next.value.length;
        if(n>240*1024){await reader.cancel();throw new Error("private preparation exceeds bound");}chunks.push(next.value);}
      const source=NativeCustodySchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if(Object.entries(binding).some(([k,v])=>source[k as keyof typeof source]!==v))throw new Error("private binding differs");
      return source;
    }catch(e){const error=new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE","Native retained evidence could not be verified.",503);(error as Error&{cause:unknown}).cause=e;throw error;}
    finally{clearTimeout(timer);}
  }
  search(scope:ResearchScope,source:NativeStoredRead,cursor?:string,limit=200){
    const {custody:c,digest}=source,resourceId=`native-search:${c.run_id}`;
    if(!Number.isInteger(limit)||limit<1||limit>200)throw new ResearchSearchError("RESEARCH_SEARCH_INVALID","Invalid native ledger page.",400);
    const fingerprint=sha256ResearchJson({actor:scope.actorUserId,workspace:scope.workspaceId,run:c.run_id,digest,limit});
    let after=-1;
    if(cursor){try{
      const [value]=this.cursors.decode(cursor,{resourceId,workspaceId:scope.workspaceId,direction:"after",queryFingerprint:fingerprint,boundarySize:1});
      if(typeof value!=="number"||!Number.isInteger(value)||value<0||value>=c.trials.length)throw new Error("invalid boundary");after=value;
    }catch{throw new ResearchSearchError("RESEARCH_SEARCH_INVALID","Native ledger cursor does not match its actor, source or page.",400);}}
    const rows=c.trials.slice(after+1,after+1+limit),last=rows.at(-1)?.source_ordinal;
    const next=last!==undefined&&last<c.trials.length-1?this.cursors.encode({resource_id:resourceId,workspace_id:scope.workspaceId,
      direction:"after",query_fingerprint:fingerprint,boundary:[last]}):null;
    return NativeSearchSchema.parse({schema_version:"research.native-search.v1",authority:"SEALED_PINNED_QUANTBT_NATIVE_IS_OPTIMIZATION",
      revision:digest,summary:c.summary,selected_trial_number:c.summary.selected_trial_number,selected_trial_ordinal:c.summary.selected_trial_number+1,
      selected_trial_scope:"NATIVE_IS_STUDY",selected_parameters_digest:c.selected_parameters_digest,
      ledger:{total:c.trials.length,rows,next_cursor:next},candidates:{population:"COMPLETE_NATIVE_TRIAL_EVALUATIONS_NOT_SCALAR_WFO_POOL",
        total:c.summary.completed_trials,plateau_membership:"NOT_PUBLISHED",plateau_membership_reason_code:"NATIVE_SOURCE_DID_NOT_RETAIN_NEIGHBOR_TRIAL_IDENTITIES"},selection_process:{method:c.summary.selection_method,
        retained_source_metadata:c.selection_evidence,metadata_reason_code:c.selection_evidence?null:"NATIVE_SOURCE_SELECTION_METADATA_NOT_RETAINED",
        objective:"IS_SHARPE",training_scope:c.summary.scope,holdout_used:false,
        evidence:"ENGINE_MEDOID_IDENTITY_MATCHES_RETAINED_TRIAL_AND_PARAMETERS",
        sampler_trace:{state:"NOT_PUBLISHED",reason_code:"NATIVE_SAMPLER_INTERNAL_TRACE_NOT_RETAINED"}}});
  }
  freeze(source:NativeStoredRead){const {custody:c,digest,checkedAtUtcMs}=source;
    return NativeFreezeSchema.parse({schema_version:"research.native-freeze.v1",authority:"SEALED_NATIVE_SELECTED_PARAMETERS_NOT_SCALAR_WFO_CERTIFICATE",
      revision:digest,selection_evidence:c.selection_evidence,selected_parameters:c.summary.selected_parameters,selected_parameters_digest:c.selected_parameters_digest,
      selected_trial_number:c.summary.selected_trial_number,selected_trial_ordinal:c.summary.selected_trial_number+1,selected_trial_scope:"NATIVE_IS_STUDY",
      selected_objective:c.summary.selected_objective,execution_profile:{id:c.execution_profile_id,digest:c.execution_profile_digest},
      artifact:{revision:c.artifact_revision,manifest_digest:c.manifest_digest,source_parts:c.source_parts,source_table_digest:c.summary.sha256,
        source_table_digest_scope:"ORIGINAL_CHILD_PARQUET_BYTES_NOT_REWRITTEN_P05_PARTS"},
      integrity:{state:"MATCH_AT_PREPARATION",verification_scope:c.verification_scope,checked_at_utc_ms:checkedAtUtcMs,
        current_bytes_rechecked:false,selected_identity_match:true,selected_parameter_digest_match:true},
      scalar_wfo_certificate:{state:"NOT_APPLICABLE",reason_code:"NATIVE_PROTOCOL_IS_NOT_SCALAR_WFO"},
      chronology:{state:"NOT_PUBLISHED",reason_code:"NATIVE_SOURCE_DID_NOT_RETAIN_FREEZE_WALL_CLOCK_EVENTS"}});
  }
}
