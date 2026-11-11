import {Body,Controller,Header,HttpCode,Inject,Post,Req,UseGuards} from "@nestjs/common";
import type {FastifyRequest} from "fastify";
import {z} from "zod";
import {AuthError,AuthService} from "../auth/auth.service";
import {mutationSecurityDenial,MUTATION_SECURITY_MESSAGE} from "../auth/mutation-security";
import type {PortalUser} from "../domain";
import {SessionGuard} from "../facade/session.guard";
import {C2P7CandidateNoStoreGuard} from "./c2-p7-review-candidate.controller";
import {C2P7OwnerConfirmSignerCandidate} from "./c2-p7-owner-confirm-signer-candidate";

type Request=FastifyRequest&{portalUser:PortalUser;portalSession:{sessionId:string;csrfSecretHash:string}};
const bodySchema=z.object({confirmation_sha256:z.string().regex(/^[a-f0-9]{64}$/),
  owner_attestation:z.string().min(1).max(32768).regex(/^[A-Za-z0-9_-]+$/)}).strict();

/** UNMOUNTED test candidate. This route only proves the app's HTTP/session
 * boundary; it does not establish an independently protected signer, trusted
 * key provisioning, source authority or permission to enable an issuer. */
@Controller("/api/admin/c2-p7-candidate")
@UseGuards(C2P7CandidateNoStoreGuard,SessionGuard)
export class C2P7OwnerConfirmSignerCandidateController {
  constructor(@Inject(C2P7OwnerConfirmSignerCandidate) private readonly signer:C2P7OwnerConfirmSignerCandidate,
    @Inject(AuthService) private readonly auth:AuthService) {}

  @Post("/confirm-signed")
  @HttpCode(200)
  @Header("Cache-Control","private, no-store")
  async confirm(@Req()req:Request,@Body()body:unknown) {
    const denied=mutationSecurityDenial(req,{csrfSecretHash:req.portalSession.csrfSecretHash,allowedOrigin:this.auth.config.PORTAL_PUBLIC_ORIGIN});
    if(denied)throw new AuthError(denied,MUTATION_SECURITY_MESSAGE[denied],403);
    const key=req.headers["x-portal-idempotency-key"];
    if(typeof key!=="string"||!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new AuthError("IDEMPOTENCY_KEY_REQUIRED","An idempotency key is required.",400);
    const input=bodySchema.safeParse(body);
    if(!input.success)throw new AuthError("C2_P7_INPUT_INVALID","Invalid request.",400);
    const proof=Buffer.from(input.data.owner_attestation,"base64url");
    if(proof.toString("base64url")!==input.data.owner_attestation||proof.length>24576) {
      proof.fill(0);throw new AuthError("C2_P7_INPUT_INVALID","Invalid request.",400);
    }
    const person={user_id:req.portalUser.userId,session_id:req.portalSession.sessionId,session_generation:req.portalUser.sessionVersion};
    try {return await this.signer.confirmOwner(person,input.data.confirmation_sha256,key,proof);}
    catch {throw new AuthError("C2_P7_REVIEW_UNAVAILABLE","The requested action is not available.",503);}
    finally {proof.fill(0);}
  }
}
