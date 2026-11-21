import {Body,CanActivate,Controller,ExecutionContext,Get,Header,HttpCode,Inject,Injectable,Post,Query,Req,UseGuards} from "@nestjs/common";
import type {FastifyReply,FastifyRequest} from "fastify";
import {z} from "zod";
import {AuthError,AuthService} from "../auth/auth.service";
import {mutationSecurityDenial,MUTATION_SECURITY_MESSAGE} from "../auth/mutation-security";
import type {PortalUser} from "../domain";
import {SessionGuard} from "../facade/session.guard";
import {C2P7EmergencyReviewCandidateService,C2P7ReviewCandidateService} from "./c2-p7-review-candidate.service";

type Request=FastifyRequest&{portalUser:PortalUser;portalSession:{sessionId:string;csrfSecretHash:string}};
const empty=z.object({}).strict();
const confirmBody=z.object({confirmation_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const resumeBody=confirmBody.extend({intent_id:z.string().uuid()}).strict();
const revokeBody=z.object({intent_id:z.string().uuid()}).strict();
const actor=(req:Request)=>({user_id:req.portalUser.userId,session_id:req.portalSession.sessionId,
  session_generation:req.portalUser.sessionVersion});
function security(req:Request,auth:AuthService,requireKey:boolean):string {
  const denied=mutationSecurityDenial(req,{csrfSecretHash:req.portalSession.csrfSecretHash,allowedOrigin:auth.config.PORTAL_PUBLIC_ORIGIN});
  if(denied)throw new AuthError(denied,MUTATION_SECURITY_MESSAGE[denied],403);
  if(!requireKey)return "";
  const key=req.headers["x-portal-idempotency-key"];
  if(typeof key!=="string"||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))throw new AuthError("IDEMPOTENCY_KEY_REQUIRED","An idempotency key is required.",400);
  return key;
}
async function call<T>(fn:()=>Promise<T>):Promise<T>{
  // Never reflect an exception, source proof, token, SQL, path or key.
  try{return await fn();}catch{throw new AuthError("C2_P7_REVIEW_UNAVAILABLE","The requested action is not available.",503);}
}
// These older preparation endpoints can create/complete records without the
// separately authenticated signer and independent reservation. Keep their
// input/security validation but do not dispatch them until a qualified
// owner-attested flow replaces them. This is not an issuer/recovery gate.
function ownerAttestationRequired():never {
  throw new AuthError("C2_P7_OWNER_ATTESTATION_REQUIRED","Owner confirmation is not commissioned on this route.",503);
}

/** This runs before SessionGuard, including on 401/403. */
@Injectable()
export class C2P7CandidateNoStoreGuard implements CanActivate {
  canActivate(ctx:ExecutionContext):boolean {ctx.switchToHttp().getResponse<FastifyReply>().header("Cache-Control","private, no-store");return true;}
}

/** Preparation-only candidate; mounted only by explicit Research bootstrap injection. Inputs never select workspace,
 * B1, source, key, scope or authority. Normal SessionGuard attaches the actor. */
@Controller("/api/admin/c2-p7-candidate")
@UseGuards(C2P7CandidateNoStoreGuard,SessionGuard)
export class C2P7ReviewCandidateController {
  constructor(@Inject(C2P7ReviewCandidateService) private readonly review:C2P7ReviewCandidateService,
    @Inject(AuthService) private readonly auth:AuthService) {}
  @Get("/preview")
  @Header("Cache-Control","private, no-store")
  async preview(@Req()req:Request,@Query()query:unknown) {
    if(!empty.safeParse(query??{}).success)throw new AuthError("C2_P7_INPUT_INVALID","Invalid request.",400);
    return call(()=>this.review.preview(actor(req)));
  }
  @Post("/confirm")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  async confirm(@Req()req:Request,@Body()body:unknown) {
    security(req,this.auth,true);const input=confirmBody.safeParse(body);
    if(!input.success)throw new AuthError("C2_P7_INPUT_INVALID","Invalid request.",400);
    return ownerAttestationRequired();
  }
  @Post("/resume")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  async resume(@Req()req:Request,@Body()body:unknown) {
    security(req,this.auth,false);const input=resumeBody.safeParse(body);
    if(!input.success)throw new AuthError("C2_P7_INPUT_INVALID","Invalid request.",400);
    return ownerAttestationRequired();
  }
  @Post("/resume-by-key")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  async resumeByKey(@Req()req:Request,@Body()body:unknown) {
    security(req,this.auth,true);const input=confirmBody.safeParse(body);
    if(!input.success)throw new AuthError("C2_P7_INPUT_INVALID","Invalid request.",400);
    return ownerAttestationRequired();
  }
}

/** Separate controller/DI graph: a broken B1, verifier or signer must not
 * prevent an independently commissioned reduction route from starting. */
@Controller("/api/admin/c2-p7-candidate")
@UseGuards(C2P7CandidateNoStoreGuard,SessionGuard)
export class C2P7EmergencyCandidateController {
  constructor(@Inject(C2P7EmergencyReviewCandidateService) private readonly emergency:C2P7EmergencyReviewCandidateService,
    @Inject(AuthService) private readonly auth:AuthService) {}
  @Post("/emergency-revoke")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  async emergencyRevoke(@Req()req:Request,@Body()body:unknown) {
    // Reduction remains available without source, policy, step-up or a client
    // idempotency key; origin/session/CSRF are still mandatory.
    security(req,this.auth,false);const input=revokeBody.safeParse(body);
    if(!input.success)throw new AuthError("C2_P7_INPUT_INVALID","Invalid request.",400);
    return call(()=>this.emergency.revoke(actor(req),input.data.intent_id));
  }
}
