/** Mounted only by explicit private ordinary composition. No install endpoint,
 * no ENV switch, native receipt, source qualification or command operation. */
import { Body, Controller, Header, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthError, AuthService } from "../auth/auth.service";
import { mutationSecurityDenial, MUTATION_SECURITY_MESSAGE } from "../auth/mutation-security";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { OrdinaryProfileAuthority } from "./ordinary-profile-authority";
import { CurrentHumanLeaseError } from "./current-human-candidate";
import { ordinaryDelegateRequest, ordinaryRevokeRequest, ordinaryAuthorityStepUpRequest,
  OrdinaryProfileAuthorityError } from "./ordinary-profile-authority.contract";

type Request=FastifyRequest&{portalUser:PortalUser;portalSession:AuthSession&{csrfSecretHash:string}};
@Controller("/api/admin/ordinary-profile-access/v1")
@UseGuards(SessionGuard)
export class OrdinaryProfileAuthorityController {
  constructor(@Inject(OrdinaryProfileAuthority) private readonly service:OrdinaryProfileAuthority,
    @Inject(AuthService) private readonly auth:AuthService){}
  private security(req:Request):string{
    const denial=mutationSecurityDenial(req,{csrfSecretHash:req.portalSession.csrfSecretHash,
      allowedOrigin:this.auth.config.PORTAL_PUBLIC_ORIGIN});
    if(denial)throw new AuthError(denial,MUTATION_SECURITY_MESSAGE[denial],403);
    const key=req.headers["x-portal-idempotency-key"];
    if(typeof key!=="string"||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new AuthError("IDEMPOTENCY_KEY_REQUIRED","An idempotency key is required.",400);
    return key;
  }
  private async execute<T extends {operation_id:string},R>(req:Request,body:unknown,schema:z.ZodType<T>,
    call:(actor:{user_id:string;session_id:string;session_generation:number},input:T)=>Promise<R>):Promise<R>{
    const key=this.security(req),parsed=schema.safeParse(body);
    if(!parsed.success)throw new AuthError("ORDINARY_AUTHORITY_INPUT_INVALID","Check the ordinary access request.",400);
    if(key!==parsed.data.operation_id)
      throw new AuthError("IDEMPOTENCY_KEY_REQUIRED","Use the request operation id as its idempotency key.",400);
    try{return await call({user_id:req.portalUser.userId,session_id:req.portalSession.sessionId,
      session_generation:req.portalUser.sessionVersion},parsed.data);}catch(error){
      if(error instanceof OrdinaryProfileAuthorityError)
        throw new AuthError(error.code,"The requested ordinary profile access is not available.",error.status);
      if(error instanceof CurrentHumanLeaseError)
        throw new AuthError("ORDINARY_AUTHORITY_RETRY_REQUIRED","The authority operation requires reconciliation.",503);
      throw error;
    }
  }
  @Post("/delegations")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  delegate(@Req()req:Request,@Body()body:unknown){
    return this.execute(req,body,ordinaryDelegateRequest,(actor,input)=>this.service.delegate(actor,input));
  }
  @Post("/revocations")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  revoke(@Req()req:Request,@Body()body:unknown){
    return this.execute(req,body,ordinaryRevokeRequest,(actor,input)=>this.service.revoke(actor,input));
  }
  @Post("/step-up")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  async stepUp(@Req()req:Request,@Body()body:unknown){
    this.security(req);const parsed=ordinaryAuthorityStepUpRequest.safeParse(body);
    if(!parsed.success)throw new AuthError("ORDINARY_AUTHORITY_INPUT_INVALID","Check the ordinary access request.",400);
    try{return await this.service.stepUp({user_id:req.portalUser.userId,session_id:req.portalSession.sessionId,
      session_generation:req.portalUser.sessionVersion},parsed.data.workspace_id,parsed.data.password,this.auth);}catch(error){
      if(error instanceof OrdinaryProfileAuthorityError)
        throw new AuthError(error.code,"The requested ordinary profile access is not available.",error.status);
      if(error instanceof CurrentHumanLeaseError)
        throw new AuthError("ORDINARY_AUTHORITY_RETRY_REQUIRED","The authority operation requires reconciliation.",503);
      throw error;
    }
  }
}
