import {Controller,Get,Header,Inject,Query,Req,UseGuards} from "@nestjs/common";
import type {FastifyRequest} from "fastify";
import {z} from "zod";
import type {AuthSession,PortalUser} from "../domain";
import {SessionGuard} from "../facade/session.guard";
import {ExecutionReadScopeError} from "../execution-v2/read-scope";
import {ExecutionScopedRuntimeManifestService} from "./scoped-runtime-manifest.service";

const querySchema=z.object({
  workspace_id:z.string().min(1).max(96).regex(/^[^\u0000-\u001f\u007f]+$/u).optional(),
  environment:z.enum(["paper","sandbox","live"]).optional(),
}).strict();
type Request=FastifyRequest&{portalUser:PortalUser;portalSession:AuthSession;
  portalWorkspaceId:string;portalViewerWorkspaceId?:string};

/** Additive explicit technical contract; V1 mixed catalogue DTO is unchanged. */
@Controller("/api/v1/execution/runtime-manifest/v2")
@UseGuards(SessionGuard)
export class ExecutionScopedRuntimeManifestController {
  constructor(@Inject(ExecutionScopedRuntimeManifestService)private readonly service:ExecutionScopedRuntimeManifestService){}
  @Get() @Header("Cache-Control","private, no-store")
  async manifest(@Req()request:Request,@Query()raw:unknown){
    const parsed=querySchema.safeParse(raw);
    if(!parsed.success)throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",400);
    return this.service.manifest({user:request.portalUser,session:request.portalSession,
      workspaceId:parsed.data.workspace_id??request.portalWorkspaceId,
      viewerWorkspaceId:request.portalViewerWorkspaceId??request.portalWorkspaceId},parsed.data.environment);
  }
}
