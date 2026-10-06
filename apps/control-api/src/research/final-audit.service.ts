import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { PortalProxyService, FacadeError } from "../facade/proxy.service";
import { ResearchMetadataRepository } from "./repository";
import type { ResearchScope } from "./contracts";
import { ResearchFinalAuditClient } from "./final-audit.client";
import { ResearchFinalAuditRepository, type AdmittedAudit, type AuditParent } from "./final-audit.repository";
import { DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID } from "./full02.profiles";
import { sha256ResearchJson } from "./preflight.service";
import { pinnedAuditTargetDigest, PINNED_AUDIT_PROFILE_ID, PINNED_AUDIT_PROFILE_DIGEST,
  ResearchFinalAuditError, ResearchFinalAuditReadSchema, type ResearchFinalAuditRead, type ResearchFinalAuditCreateSchema,
  type PinnedAuditSealSchema } from "./final-audit.contract";
import { ResearchArtifactVerifyClient } from "./artifact-verify.client";
import { ResearchArtifactVerifyRepository } from "./artifact-verify.repository";
import { z } from "zod";

@Injectable()
export class ResearchFinalAuditService {
  constructor(private readonly repository:ResearchFinalAuditRepository,private readonly client:ResearchFinalAuditClient,
    private readonly metadata:ResearchMetadataRepository,private readonly proxy:PortalProxyService,
    private readonly bytes:ResearchArtifactVerifyClient,private readonly artifacts:ResearchArtifactVerifyRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config:ControlApiConfig){}
  private requireEnabled():void{
    if(this.config.FEATURE_RESEARCH_RUN_PRODUCER!=="true" || this.config.FEATURE_RESEARCH_WFO_PROFILE!=="true"
      || this.config.FEATURE_RESEARCH_RETAINED_ARTIFACTS!=="true")
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE","Linked audit is not enabled in this profile.",503);
  }
  private mayCreate(user:PortalUser):boolean{return user.role==="ADMIN" && user.status==="ACTIVE" && !user.mustChangePassword;}
  private requireLinkedAuditProfile(parent:AuditParent):void{
    // This endpoint is the qualified run-global, Advanced linked-child audit.
    // A per-fold deployment singleton is not a run-global optimizer target.
    if(parent.executionProfileId===DELTA_PER_FOLD_DECAY_PROFILE_ID)
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_APPLICABLE",
        "Run-global selection audit does not apply to per-fold decay. Read the retained per-fold selection and OOS generation evidence.",409);
    // Three Window already retained its independent Holdout against the frozen
    // calibration selection. Do not recast its single calibration fold as WFO.
    if(parent.executionProfileId===DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID)
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_APPLICABLE",
        "Advanced linked audit does not apply to Three Window. The Report carries its sealed independent Holdout selection proof.",409);
  }
  async read(user:PortalUser,scope:ResearchScope,runId:string):Promise<ResearchFinalAuditRead>{
    this.requireEnabled();
    const parent=await this.repository.parent(scope,runId);
    this.requireLinkedAuditProfile(parent);
    const target=await this.client.prepare(scope.actorUserId,parent.pins);
    return this.compose(scope,runId,pinnedAuditTargetDigest(target),this.mayCreate(user));
  }
  private async compose(scope:ResearchScope,runId:string,targetDigest:string,mayCreate:boolean):Promise<ResearchFinalAuditRead>{
    const child=await this.repository.latest(scope,runId,targetDigest);
    const verification=child?.proof ?? null;
    const state=!child?"READY_TO_ADMIT":child.state==="READY" && verification?"VERIFIED":child.state==="FAILED"?"FAILED"
      :child.state==="CANCELLED"?"CANCELLED":child.state==="READY"?"AWAITING_VERIFICATION"
      :child.state==="RUNNING"||child.state==="SEALING"?"RUNNING":"QUEUED";
    return ResearchFinalAuditReadSchema.parse({schema_version:"research.linked-final-audit.v1",parent_run_id:runId,state,
      target_digest:targetDigest,profile_id:PINNED_AUDIT_PROFILE_ID,profile_digest:PINNED_AUDIT_PROFILE_DIGEST,
      may_create:mayCreate && (!child||["FAILED","CANCELLED"].includes(child.state)),child_run_id:child?.runId??null,
      progress_href:child?`/research/quantbt/runs/${child.runId}/progress`:null,verification});
  }
  async create(user:PortalUser,scope:ResearchScope,runId:string,input:z.infer<typeof ResearchFinalAuditCreateSchema>,requestId:string){
    this.requireEnabled();
    if(!this.mayCreate(user))throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_FORBIDDEN","Audit creation requires the existing Research producer authority.",403);
    const parent=await this.repository.parent(scope,runId);
    this.requireLinkedAuditProfile(parent);
    const target=await this.client.prepare(scope.actorUserId,parent.pins);
    const targetDigest=pinnedAuditTargetDigest(target);
    if(targetDigest!==input.target_digest)throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Frozen target changed; reread before creating audit.",409);
    const original=parent.legacyRequest.research;
    if(!original||typeof original!=="object"||Array.isArray(original))throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_APPLICABLE","Original producer declaration is unavailable.",409);
    const research=original as Record<string,unknown>;
    const workDigest=sha256ResearchJson({schema_version:"research.pinned-audit-work.v1",target_digest:targetDigest,
      requested_spec_digest:parent.requestedSpecDigest,effective_spec_digest:parent.effectiveSpecDigest,profile_digest:PINNED_AUDIT_PROFILE_DIGEST});
    // Whitelist, don't spread optimizer/what-if/imported knobs from a parent.
    const keys=["schema_version","preflight_token","requested_spec","requested_spec_digest","effective_spec_digest",
      "dataset_binding_digest","manifest_digest","snapshot_id","snapshot_content_hash","alpha_id","alpha_version_id",
      "execution_adapter_id","adapter_contract_digest"];
    const legacy={strategy_id:parent.legacyRequest.strategy_id,dataset_id:parent.legacyRequest.dataset_id,
      protocol:parent.legacyRequest.protocol,research_contract_version:"research.run-request.v1",research:{
        ...Object.fromEntries(keys.map(key=>[key,research[key]])),client_intent_id:input.client_intent_id,intent_kind:"DIAGNOSTIC",
        execution_profile_id:PINNED_AUDIT_PROFILE_ID,execution_profile_digest:PINNED_AUDIT_PROFILE_DIGEST,work_digest:workDigest,
        final_audit_target:target,final_audit_target_digest:targetDigest}};
    const admitted=await this.repository.admit(scope,parent,target,input.client_intent_id,legacy,workDigest);
    await this.dispatch(user,scope,admitted,requestId);
    return this.compose(scope,runId,targetDigest,false);
  }
  private async dispatch(user:PortalUser,scope:ResearchScope,producer:AdmittedAudit,requestId:string){
    if(producer.dispatchState==="DISPATCHED")return;
    const claim=await this.metadata.claimNextDurableJob(scope,{workerId:"research-pinned-audit-v1",
      leaseSeconds:this.config.RESEARCH_RUN_PRODUCER_LEASE_SECONDS,jobId:producer.jobId});
    if(!claim||claim.jobId!==producer.jobId||claim.runId!==producer.runId)
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE","Audit is durable; its dispatch lease is being recovered.",503);
    await this.metadata.recordRunProducerClaim(scope,{runId:producer.runId,jobId:claim.jobId,workerAttemptId:claim.workerAttemptId,leaseEpoch:claim.leaseEpoch});
    const trace=createHash("sha256").update(`research-pinned-audit:${requestId}`).digest("hex");
    let write;
    try{
      write=await this.proxy.handleWrite({method:"POST",path:"/api/runs",query:undefined,
        body:JSON.stringify({...producer.legacyRequest,job_id:claim.jobId,worker_attempt_id:claim.workerAttemptId,lease_epoch:claim.leaseEpoch}),
        contentType:"application/json",requestId,traceparent:`00-${trace.slice(0,32)}-${trace.slice(32,48)}-01`,user,
        workspaceId:scope.workspaceId,idempotencyKey:`research-pinned-audit:${producer.runId}`,retryPending:true,
        researchRunProducer:{runId:producer.runId,jobId:claim.jobId,workerAttemptId:claim.workerAttemptId,leaseEpoch:claim.leaseEpoch}});
    }catch(error){
      if(error instanceof FacadeError&&error.status<500)throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UPSTREAM_REJECTED","Private run adapter rejected the pinned audit.",502);
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE","Audit dispatch outcome is unknown; replay the same intent.",503);
    }
    if(write.status!==202||write.body?.run_id!==producer.runId)throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UPSTREAM_REJECTED","Private run adapter returned another identity.",502);
    await this.metadata.recordRunProducerDispatched(scope,{runId:producer.runId,jobId:claim.jobId,
      workerAttemptId:claim.workerAttemptId,leaseEpoch:claim.leaseEpoch,receipt:{run_id:producer.runId,status:"QUEUED",
        facade_idempotency_key:write.idempotencyKey,facade_replayed:write.replayed}});
  }
  async seal(scope:ResearchScope,input:z.infer<typeof PinnedAuditSealSchema>):Promise<void>{
    this.requireEnabled();
    const expected=await this.artifacts.expectation(scope,input.run_id,input.artifact_revision);
    if(!expected||expected.artifactId!==input.artifact_id||expected.state!=="SEALED"||expected.expectedManifestDigest!==input.manifest_digest)
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Sealed audit custody does not match.",409);
    let observed;
    try { observed=await this.bytes.observe(scope.actorUserId,input.artifact_id,expected.parts.map(part=>part.relativePath)); }
    catch { throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE","Audit byte observation is temporarily unavailable.",503); }
    const resultDocument=observed.documents.find(doc=>doc.relative_path==="documents/audit_result.json");
    if(observed.artifact_id!==input.artifact_id || observed.manifest_state!=="PRESENT"
      ||observed.manifest_digest!==expected.expectedManifestDigest || observed.manifest_artifact_revision!==input.artifact_revision
      ||expected.parts.some(part=>observed.parts.find(value=>value.relative_path===part.relativePath)?.observed_digest!==part.partDigest)
      ||observed.documents.some(doc=>doc.observed_digest!==doc.recorded_digest)
      ||resultDocument?.observed_digest!==sha256ResearchJson(input.result))
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Audit bytes do not verify against original seal expectations.",409);
    await this.repository.sealProof(scope,input);
  }
}
