import {Inject,Injectable} from "@nestjs/common";
import {AccessPolicyError} from "../execution-v2/access.contract";
import {accessDigest} from "../execution-v2/access-digest";
import {ExecutionAccessService} from "../execution-v2/access.service";
import type {ReadScopePrincipal} from "../execution-v2/read-scope";
import {CurrentOperationalReads,OperationalReadError,operationalHttpCall} from "../operations/current-operational-read";
import {IdentifierSchema} from "../operations/contracts";
import {ParentFieldPurposeError} from "../governance/positive-parent.authority";
import {activationPerspectiveEnvironment,currentActivationCapabilities,currentActivationPlanRead,
  type CurrentActivationCapabilities,type CurrentActivationPlanRead} from "./current-activation.contract";
import {activationRoot,activationSections,qualifyActivation,type ActivationSelection} from "./current-activation.authority";
import {CurrentActivationRepository,ActivationMetadataError,type ActivationMetadata,type ActivationCandidate} from "./current-activation.repository";
const safe=(error:unknown):Error=>{
  if(error instanceof AccessPolicyError||error instanceof OperationalReadError)return error;
  if(error instanceof ParentFieldPurposeError)return new OperationalReadError("ACTIVATION_FIELD_PURPOSE_UNAVAILABLE");
  if(error instanceof ActivationMetadataError)return new OperationalReadError(error.code==="BOUND"?"OPERATIONAL_READ_RESPONSE_BOUND":
    "ACTIVATION_METADATA_INTEGRITY_UNAVAILABLE");
  return new OperationalReadError("ACTIVATION_METADATA_UNAVAILABLE");
};
@Injectable()
export class CurrentActivationReads{
  private readonly flights:CurrentOperationalReads;
  constructor(@Inject(CurrentActivationRepository) private readonly repository:CurrentActivationRepository,
    @Inject(ExecutionAccessService) access:ExecutionAccessService){this.flights=new CurrentOperationalReads(access);}
  capabilities(principal:ReadScopePrincipal,environment:unknown):Promise<CurrentActivationCapabilities>{
    return this.read(principal,environment) as Promise<CurrentActivationCapabilities>;
  }
  detail(principal:ReadScopePrincipal,planId:string,environment:unknown):Promise<CurrentActivationPlanRead>{
    return this.read(principal,environment,planId) as Promise<CurrentActivationPlanRead>;
  }
  private read(principal:ReadScopePrincipal,environment:unknown,planId?:string){
    return operationalHttpCall(async()=>{
      const actor={user_id:principal.user.userId,session_id:principal.session.sessionId,session_generation:principal.session.sessionVersion};
      const prepared=await this.flights.prepareExact<CurrentActivationCapabilities|CurrentActivationPlanRead>(actor,principal.workspaceId,async captured=>{
        const env=activationPerspectiveEnvironment.safeParse(environment);
        if(!env.success)throw new OperationalReadError("ACTIVATION_PERSPECTIVE_REQUIRED",400);
        const rootId=activationRoot(captured,env.data);
        let candidate:ActivationCandidate|undefined;
        if(planId!==undefined){
          if(!IdentifierSchema.safeParse(planId).success)throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND",404);
          candidate=await this.repository.identityCandidate(principal.workspaceId,planId)??undefined;
          if(!candidate)throw new OperationalReadError("OPERATIONAL_READ_NOT_FOUND",404);
        }
        const selection:ActivationSelection={workspaceId:principal.workspaceId,environment:env.data,rootId,
          kind:candidate?"PLAN":"CAPABILITIES",...(candidate?{planId:candidate.planId,capabilityKey:candidate.capabilityKey}:{})};
        let snapshot:ActivationMetadata|undefined;let sections={evidence:false,compatibility:false};
        return {target:{resource:{kind:"ROOT" as const,id:rootId},environment:env.data},
          authorize:context=>qualifyActivation(context,selection),
          decode:async context=>{
            sections=candidate?activationSections(context,selection):sections;
            snapshot=await this.repository.protectedDetails(principal.workspaceId,candidate,sections);
            const common={record_authority:"PORTAL" as const,provenance_basis:"CURRENT_CORE_BASELINE" as const,
              field_contract_revision:"portal.execution.parent-fields.v1" as const,workspace_id:principal.workspaceId,
              perspective:{environment:env.data,root_id:rootId,basis:"CURRENT_PUBLISHED_TECHNICAL_ROOT" as const,captured_native_environment:null}};
            const publicBody=candidate?{...common,schema_version:"portal.execution.activation-plan-read.v2" as const,
              plan:snapshot.plan,capability:snapshot.capabilities[0],
              evidence:sections.evidence?{availability:"AVAILABLE",basis:"STORED_NOT_ACTIVATION_TRUST",items:snapshot.evidence}:
                {availability:"NOT_AUTHORIZED"},
              compatibility:sections.compatibility?{availability:"AVAILABLE",basis:"STORED_REQUIREMENTS_NOT_COMPATIBILITY_VERDICT",items:snapshot.compatibility}:
                {availability:"NOT_AUTHORIZED"}}:
              {...common,schema_version:"portal.execution.activation-capabilities-read.v2" as const,capabilities:snapshot.capabilities};
            // ONLY projected/authorized bytes; observation clock is not revision.
            const body={...publicBody,snapshot_revision:accessDigest(publicBody),observed_at_ms:Math.max(context.now_ms,Date.now())};
            return candidate?currentActivationPlanRead.parse(body):currentActivationCapabilities.parse(body);
          },
          beforeFinal:async()=>{
            if(snapshot&&!await this.repository.isUnchanged(principal.workspaceId,snapshot.witness,candidate,sections))
              throw new OperationalReadError("OPERATIONAL_READ_CHANGED",409);
          }};
      },safe);
      return this.flights.finish(prepared);
    });
  }
}
