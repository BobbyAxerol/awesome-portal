import { Body,Controller,Get,Header,Inject,Param,Post,Query,Req,Res,UseGuards } from "@nestjs/common";
import type { FastifyReply,FastifyRequest } from "fastify";
import { z } from "zod";
import type { PortalUser } from "../domain";
import { AuthService } from "../auth/auth.service";
import { mutationSecurityDenial,MUTATION_SECURITY_MESSAGE } from "../auth/mutation-security";
import { SessionGuard } from "../facade/session.guard";
import { commandIntent,commandSubmit,commandWorkspace,commandId,commandKey } from "./command.contract";
import { ExecutionCommandService } from "./command.service";
import { commandCollectionQuery,CommandCollectionError } from "./command-collection.contract";
import { CommandHttpError,commandHttpCall } from "./command.error";
type Request=FastifyRequest&{portalUser:PortalUser;portalSession:{sessionId:string;csrfSecretHash:string}};

/** Named PM capital operations only; no generic CLI/URL, credentials or authority install. */
@Controller("/api/v1/execution/capital-commands")
@UseGuards(SessionGuard)
export class ExecutionCommandController {
  constructor(@Inject(ExecutionCommandService)private readonly service:ExecutionCommandService,
    @Inject(AuthService)private readonly auth:AuthService){}
  private actor(r:Request){return {user_id:r.portalUser.userId,session_id:r.portalSession.sessionId,session_generation:r.portalUser.sessionVersion};}
  private parse<T>(schema:z.ZodType<T,z.ZodTypeDef,any>,input:unknown):T {
    const value=schema.safeParse(input);if(!value.success)throw new CommandHttpError("COMMAND_INPUT_INVALID","Check the command fields.",400);return value.data;
  }
  private security(r:Request,key?:string){
    const denial=mutationSecurityDenial(r,{csrfSecretHash:r.portalSession.csrfSecretHash,allowedOrigin:this.auth.config.PORTAL_PUBLIC_ORIGIN});
    if(denial)throw new CommandHttpError(denial,MUTATION_SECURITY_MESSAGE[denial],403);
    const header=this.parse(commandKey,r.headers["x-portal-idempotency-key"]);
    if(key!==undefined&&header!==key)throw new CommandHttpError("COMMAND_INPUT_INVALID","Use the same command key.",400);
  }
  private call<T>(fn:()=>Promise<T>):Promise<T>{return commandHttpCall(fn);}
  @Post("/preview") @Header("Cache-Control","private, no-store")
  async preview(@Req()r:Request,@Body()raw:unknown,@Res({passthrough:true})reply:FastifyReply){
    const i=this.parse(commandIntent,raw);this.security(r,i.business_payload.idempotency_key);reply.code(200);
    return this.call(()=>this.service.preview(this.actor(r),i));
  }
  @Post("") @Header("Cache-Control","private, no-store")
  async submit(@Req()r:Request,@Body()raw:unknown,@Res({passthrough:true})reply:FastifyReply){
    const i=this.parse(commandSubmit,raw);this.security(r,i.intent.business_payload.idempotency_key);reply.code(200);
    return this.call(()=>this.service.submit(this.actor(r),i.intent,i.preview_digest));
  }
  @Get("") @Header("Cache-Control","private, no-store")
  async collection(@Req()r:Request,@Query()raw:unknown){
    const q=this.parse(commandCollectionQuery,raw);
    try{return await this.service.collection(this.actor(r),q);}
    catch(error){
      if(error instanceof CommandCollectionError)throw new CommandHttpError(error.code,
        "The command collection is unavailable. Refresh this exact resource before retrying.",error.status);
      return this.call(async()=>{throw error;});
    }
  }
  @Get("/:id") @Header("Cache-Control","private, no-store")
  async status(@Req()r:Request,@Param("id")id:string,@Query()raw:unknown){
    const q=this.parse(commandWorkspace,raw),key=this.parse(commandId,id);
    return this.call(()=>this.service.status(this.actor(r),q.workspace_id,key));
  }
  @Post("/:id/reconcile") @Header("Cache-Control","private, no-store")
  async reconcile(@Req()r:Request,@Param("id")id:string,@Body()raw:unknown,@Res({passthrough:true})reply:FastifyReply){
    const q=this.parse(commandWorkspace,raw),key=this.parse(commandId,id);this.security(r);reply.code(200);
    return this.call(()=>this.service.reconcile(this.actor(r),q.workspace_id,key));
  }
}
