import { Inject,Injectable } from "@nestjs/common";
import { AccessPolicyError } from "../execution-v2/access.contract";
import { ExecutionAccessService } from "../execution-v2/access.service";
import type { ReadScopePrincipal } from "../execution-v2/read-scope";
import { CurrentOperationalReads,OperationalReadError,operationalHttpCall,type PreparedOperationalRead } from "../operations/current-operational-read";
import { IdentifierSchema } from "../operations/contracts";
import { ParentFieldPurposeError } from "./positive-parent.authority";
import { LiveParentRepository,LiveParentRepositoryError,type LiveParentSnapshot } from "./live-parent.repository";
import { qualifyLiveParentDetailed } from "./live-parent.authority";
import { liveParentRead,liveBlockers,type LiveParentRead } from "./live-parent.contract";
function safe(e:unknown):Error{
  if(e instanceof AccessPolicyError||e instanceof OperationalReadError)return e;
  if(e instanceof ParentFieldPurposeError)return new OperationalReadError("GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE");
  if(e instanceof LiveParentRepositoryError)return new OperationalReadError(e.code==="NOT_FOUND"?"OPERATIONAL_READ_NOT_FOUND":
    e.code==="BOUND"?"OPERATIONAL_READ_RESPONSE_BOUND":"GOVERNANCE_PARENT_INTEGRITY_UNAVAILABLE",e.code==="NOT_FOUND"?404:503);
  return new OperationalReadError("GOVERNANCE_PARENT_UNAVAILABLE");
}
function ms(value:string):number{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))throw Error("LIVE_PARENT_TIME_INVALID");
  const n=Date.parse(value);if(!Number.isSafeInteger(n)||n<0)throw Error("LIVE_PARENT_TIME_INVALID");return n;
}
const publicText=(v:string)=>v.length>0&&[...v].length<=191&&!/[\u0000-\u001f\u007f]/u.test(v);
/** Only called for a snapshot that requested LIVE_BLOCKERS. Never truncates, never maps invalid/absent data to zero. */
function mapBlockers(snapshot:LiveParentSnapshot){
  const b=snapshot.blockers,a=snapshot.approval;
  if(!b||(b.count===0)!==(b.summary===null))return liveBlockers.parse({availability:"ABSENT",reason_code:"BLOCKER_FIELDS_INVALID"});
  if(b.summary!==null&&!publicText(b.summary))return liveBlockers.parse({availability:"ABSENT",reason_code:"BLOCKER_SUMMARY_NOT_PUBLIC"});
  return liveBlockers.parse({availability:"AVAILABLE",basis:"SAME_READ_SNAPSHOT_AS_APPROVAL",approval_id:a.approval_id,
    approval_version:a.approval_version,blocker_count:b.count,blocker_summary:b.summary});
}
export function mapLiveParent(snapshot:LiveParentSnapshot,observedAt:number):LiveParentRead{
  const p=snapshot.identity,a=snapshot.approval;
  if(p.approvalId!==a.approval_id)throw Error("LIVE_PARENT_IDENTITY_INVALID");
  return liveParentRead.parse({schema_version:"portal.execution.live-parent.v2",family:"LIVE_GATE",workspace_id:p.workspaceId,
    record_authority:"PORTAL",provenance_basis:"CURRENT_CORE_BASELINE",field_contract_revision:"portal.execution.parent-fields.v1",
    observed_at_ms:observedAt,anchors:{deployment_id:p.deploymentId,environment:"LIVE"},
    source:{authority:"PORTAL",source_verdict:"NOT_ASSERTED",source_side_effect_requested:false,
      runtime_activation_requested:false},
    approval:{approval_id:a.approval_id,gate:"LIVE_GATE",status:a.status,approval_version:a.approval_version,policy_version:a.policy_version,
      quorum_required:a.quorum_required,quorum_met:a.quorum_met,evidence_complete:a.evidence_complete,
      created_at_ms:ms(a.created_at),updated_at_ms:ms(a.updated_at),sla_due_at_ms:ms(a.sla_due_at),expires_at_ms:ms(a.expires_at),
      decided_at_ms:a.decided_at===null?null:ms(a.decided_at)},
    accepted_manager_facts:{availability:"NOT_PUBLISHED",reason_code:"PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION"},
    ...(snapshot.blockers!==undefined?{blockers:mapBlockers(snapshot)}:{})});
}
@Injectable()
export class LiveParentReads{
  private readonly flights:CurrentOperationalReads;
  constructor(@Inject(LiveParentRepository)private readonly repository:LiveParentRepository,
    @Inject(ExecutionAccessService)access:ExecutionAccessService){this.flights=new CurrentOperationalReads(access);}
  finish<T,R=T>(handle:PreparedOperationalRead<T>,project?:(body:T)=>R):Promise<R>{
    return operationalHttpCall(()=>this.flights.finish(handle,project));
  }
  prepare(principal:ReadScopePrincipal,id:string):Promise<PreparedOperationalRead<LiveParentRead>>{
    const actor={user_id:principal.user.userId,session_id:principal.session.sessionId,session_generation:principal.session.sessionVersion};
    return operationalHttpCall(()=>this.flights.prepareExact(actor,principal.workspaceId,async()=>{
      if(!IdentifierSchema.safeParse(id).success)throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND",404);
      const candidate=await this.repository.identityCandidate(principal.workspaceId,id);
      if(!candidate)throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND",404);
      let snapshot:LiveParentSnapshot|undefined,wantBlockers=false;
      return {target:{resource:{kind:"DEPLOYMENT" as const,id:candidate.deploymentId},environment:"live" as const},
        authorize:context=>{const q=qualifyLiveParentDetailed(context,candidate);wantBlockers=q.blockers;
          return {proof:q.proof,valid_until_ms:q.valid_until_ms};},
        decode:async context=>{snapshot=await this.repository.protectedDetails(candidate,wantBlockers?{blockers:true}:undefined);
          return mapLiveParent(snapshot,Math.max(context.now_ms,Date.now()));},
        beforeFinal:async()=>{if(snapshot&&!await this.repository.isUnchanged(candidate,snapshot.revision,snapshot.blockers!==undefined?{blockers:true}:undefined))
          throw new OperationalReadError("OPERATIONAL_READ_CHANGED",409);}};
    },safe));
  }
  async detail(principal:ReadScopePrincipal,id:string):Promise<LiveParentRead>{return this.finish(await this.prepare(principal,id));}
}
