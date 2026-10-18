import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthError, AuthService } from "../auth/auth.service";
import { mutationSecurityDenial, MUTATION_SECURITY_MESSAGE } from "../auth/mutation-security";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { AccessActor, AccessPolicyError, accessAuditQuery, accessPreview, accessProposal, accessRevoke, accessWorkspaceQuery, accessText } from "./access.contract";
import { ExecutionAccessService } from "./access.service";
import { eligibilityQuery, navigationInput } from "./self-eligibility";

type AccessRequest=FastifyRequest&{portalUser:PortalUser;portalSession:{sessionId:string;csrfSecretHash:string}};
const stepUpBody=z.object({workspace_id:accessText,password:z.string().min(1).max(256)}).strict();

/** Named Portal policy operations only. No public policy-install or TS-acceptance path. */
@Controller("/api/admin/profile-access/v2")
@UseGuards(SessionGuard)
export class ExecutionAccessController {
  constructor(@Inject(ExecutionAccessService) private readonly service:ExecutionAccessService,
    @Inject(AuthService) private readonly auth:AuthService) {}
  private actor(request:AccessRequest):AccessActor {
    return {user_id:request.portalUser.userId,session_id:request.portalSession.sessionId,session_generation:request.portalUser.sessionVersion};
  }
  private security(request:AccessRequest):string {
    const denial=mutationSecurityDenial(request,{csrfSecretHash:request.portalSession.csrfSecretHash,allowedOrigin:this.auth.config.PORTAL_PUBLIC_ORIGIN});
    if(denial)throw new AuthError(denial,MUTATION_SECURITY_MESSAGE[denial],403);
    const key=request.headers["x-portal-idempotency-key"];
    if(typeof key!=="string"||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))throw new AuthError("IDEMPOTENCY_KEY_REQUIRED","An idempotency key is required.",400);
    return key;
  }
  private parse<Input,Output>(schema:z.ZodType<Output,z.ZodTypeDef,Input>,value:unknown):Output {
    const parsed=schema.safeParse(value);
    if(!parsed.success)throw new AuthError("ACCESS_INPUT_INVALID","Check the access request fields.",400);
    return parsed.data;
  }
  private async call<T>(fn:()=>Promise<T>):Promise<T> {
    try{return await fn();}catch(error){
      if(error instanceof AccessPolicyError)throw new AuthError(error.code,"The requested access is not available.",error.status);
      throw error;
    }
  }
  @Get("/eligibility")
  @Header("Cache-Control","private, no-store")
  async eligibility(@Req()req:AccessRequest,@Query()query:unknown) {
    const input=this.parse(eligibilityQuery,query);
    return this.call(()=>this.service.eligibility(this.actor(req),input));
  }
  @Get("/self-navigation")
  @Header("Cache-Control","private, no-store")
  async selfNavigation(@Req()req:AccessRequest,@Query()query:unknown) {
    const input=this.parse(navigationInput,query);
    return this.call(()=>this.service.selfNavigation(this.actor(req),input));
  }
  @Get("/effective")
  @Header("Cache-Control","private, no-store")
  async effective(@Req()req:AccessRequest,@Query()query:unknown) {
    const input=this.parse(accessWorkspaceQuery,query);
    return this.call(()=>this.service.effective(this.actor(req),input.workspace_id));
  }
  @Post("/preview")
  @Header("Cache-Control","private, no-store")
  async preview(@Req()req:AccessRequest,@Body()body:unknown,@Res({passthrough:true})reply:FastifyReply) {
    this.security(req);const input=this.parse(accessPreview,body);reply.code(200);
    return this.call(()=>this.service.preview(this.actor(req),input.workspace_id,input.change));
  }
  @Post("/proposals")
  @Header("Cache-Control","private, no-store")
  async propose(@Req()req:AccessRequest,@Body()body:unknown,@Res({passthrough:true})reply:FastifyReply) {
    const key=this.security(req),input=this.parse(accessProposal,body);
    const result=await this.call(()=>this.service.propose(this.actor(req),input.workspace_id,input.change,input.preview_digest,key));
    reply.code(result.receipt.http_status);return {schema_version:"portal.access-result.v1",...result};
  }
  @Get("/proposals/:id")
  @Header("Cache-Control","private, no-store")
  async proposal(@Req()req:AccessRequest,@Query()query:unknown,@Param("id")id:string) {
    const input=this.parse(accessWorkspaceQuery,query);
    return this.call(()=>this.service.proposal(this.actor(req),input.workspace_id,this.parse(accessText,id)));
  }
  @Post("/grants/:id/revoke")
  @Header("Cache-Control","private, no-store")
  async revoke(@Req()req:AccessRequest,@Body()body:unknown,@Param("id")id:string,@Res({passthrough:true})reply:FastifyReply) {
    const key=this.security(req),input=this.parse(accessRevoke,body);
    const result=await this.call(()=>this.service.revoke(this.actor(req),input.workspace_id,this.parse(accessText,id),input.expected_policy_revision,input.expected_grant_revision,key,input.reason));
    reply.code(result.receipt.http_status);return {schema_version:"portal.access-result.v1",...result};
  }
  @Post("/grants/:id/preview-revoke")
  @Header("Cache-Control","private, no-store")
  async previewRevoke(@Req()req:AccessRequest,@Body()body:unknown,@Param("id")id:string,@Res({passthrough:true})reply:FastifyReply) {
    this.security(req);const input=this.parse(accessRevoke,body);reply.code(200);
    return this.call(()=>this.service.previewRevoke(this.actor(req),input.workspace_id,this.parse(accessText,id),
      input.expected_policy_revision,input.expected_grant_revision,input.reason));
  }
  @Post("/step-up")
  @Header("Cache-Control","private, no-store")
  async stepUp(@Req()req:AccessRequest,@Body()body:unknown,@Res({passthrough:true})reply:FastifyReply) {
    this.security(req);const input=this.parse(stepUpBody,body);reply.code(200);
    return this.call(()=>this.service.stepUp(this.actor(req),input.workspace_id,input.password));
  }
  @Get("/audit")
  @Header("Cache-Control","private, no-store")
  async audit(@Req()req:AccessRequest,@Query()query:unknown) {
    const input=this.parse(accessAuditQuery,query);
    return this.call(()=>this.service.audit(this.actor(req),input.workspace_id,input.subject_user_id,input.limit,input.after));
  }
}
