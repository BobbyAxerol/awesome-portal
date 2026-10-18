import { Inject,Injectable } from "@nestjs/common";
import { AccessPolicyError } from "../execution-v2/access.contract";
import { ExecutionAccessService } from "../execution-v2/access.service";
import { ExecutionReadScopes,type ReadScopePrincipal } from "../execution-v2/read-scope";
import { CurrentOperationalReads,OperationalReadError,operationalHttpCall,type PreparedOperationalRead } from "../operations/current-operational-read";
import { IdentifierSchema } from "../operations/contracts";
import { ParentFieldPurposeError } from "./positive-parent.authority";
import { FollowingParentRepository,FollowingParentError,type FollowingFamily,type FollowingSections,type FollowingSnapshot } from "./following-parent.repository";
import { qualifyFollowingParent,followingSections } from "./following-parent.authority";
import { mapFollowingParent } from "./following-parent.mapper";
import type { FollowingParentRead } from "./following-parent.contract";
function safe(error:unknown):Error{
  if(error instanceof AccessPolicyError||error instanceof OperationalReadError)return error;
  if(error instanceof ParentFieldPurposeError)return new OperationalReadError("GOVERNANCE_PARENT_FIELD_PURPOSE_UNAVAILABLE");
  if(error instanceof FollowingParentError)return new OperationalReadError(error.code==="NOT_FOUND"?"OPERATIONAL_READ_NOT_FOUND":
    error.code==="BOUND"?"OPERATIONAL_READ_RESPONSE_BOUND":"GOVERNANCE_PARENT_INTEGRITY_UNAVAILABLE",error.code==="NOT_FOUND"?404:503);
  return new OperationalReadError("GOVERNANCE_PARENT_UNAVAILABLE");
}
@Injectable()
export class FollowingParentReads{
  private readonly flights:CurrentOperationalReads;
  constructor(@Inject(FollowingParentRepository)private readonly repository:FollowingParentRepository,
    @Inject(ExecutionAccessService)access:ExecutionAccessService,@Inject(ExecutionReadScopes)private readonly scopes:ExecutionReadScopes){
    this.flights=new CurrentOperationalReads(access);
  }
  mode(p:ReadScopePrincipal){return this.scopes.coreSelectionMode(p);}
  finish<T,R=T>(prepared:PreparedOperationalRead<T>,project?:(body:T)=>R){return operationalHttpCall(()=>this.flights.finish(prepared,project));}
  prepare(principal:ReadScopePrincipal,family:FollowingFamily,deployment:string):Promise<PreparedOperationalRead<FollowingParentRead>>{
    const actor={user_id:principal.user.userId,session_id:principal.session.sessionId,session_generation:principal.session.sessionVersion};
    return operationalHttpCall(()=>this.flights.prepareExact(actor,principal.workspaceId,async()=>{
      if(!IdentifierSchema.safeParse(deployment).success)throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND",404);
      const candidate=await this.repository.identityCandidate(principal.workspaceId,family,deployment);
      if(!candidate)throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND",404);
      let snapshot:FollowingSnapshot|undefined,sections:FollowingSections|undefined;
      return {target:{resource:{kind:"DEPLOYMENT" as const,id:candidate.deploymentId},environment:candidate.requestedEnvironment},
        authorize:context=>qualifyFollowingParent(context,candidate),
        decode:async context=>{sections=followingSections(context,candidate);
          snapshot=await this.repository.protectedDetails(candidate,sections);
          return mapFollowingParent(snapshot.raw,sections,Math.max(context.now_ms,Date.now()));},
        beforeFinal:async()=>{if(snapshot&&sections&&!await this.repository.isUnchanged(candidate,snapshot.revision,sections))
          throw new OperationalReadError("OPERATIONAL_READ_CHANGED",409);}};
    },safe));
  }
  async detail(p:ReadScopePrincipal,family:FollowingFamily,deployment:string){return this.finish(await this.prepare(p,family,deployment));}
}
