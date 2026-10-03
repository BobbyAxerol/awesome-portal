import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import type { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchCurrentSourceReadQuerySchema, ResearchCurrentSourceRunIdSchema } from "./current-source.contract";
import { ResearchFinalAuditCreateSchema, ResearchFinalAuditError } from "./final-audit.contract";
import { ResearchFinalAuditService } from "./final-audit.service";
interface AuditRequest extends FastifyRequest {portalUser:PortalUser;portalWorkspaceId:string;portalSession:{csrfSecretHash:string};}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchFinalAuditController {
  constructor(@Inject(ResearchFinalAuditService) private readonly service:ResearchFinalAuditService,
    @Inject(WorkspacesRepository) private readonly workspaces:WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config:ControlApiConfig){}
  private async scope(request:AuditRequest,runId:string,rawQuery:unknown){
    const query=ResearchCurrentSourceReadQuerySchema.safeParse(rawQuery??{});
    if(!ResearchCurrentSourceRunIdSchema.safeParse(runId).success||!query.success)
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_INVALID","Invalid audit read.",400);
    const workspaceId=query.data.workspace_id??request.portalWorkspaceId;
    if(!await this.workspaces.isMember(workspaceId,request.portalUser.userId))
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_FOUND","Research workspace was not found.",404);
    return {workspaceId,actorUserId:request.portalUser.userId};
  }
  @Get(":runId/final-audit")
  @Header("Cache-Control", "private, no-store")
  async read(@Req() request:AuditRequest,@Param("runId") runId:string,@Query() query:unknown){
    return this.service.read(request.portalUser,await this.scope(request,runId,query),runId);
  }
  @Post(":runId/final-audit")
  @Header("Cache-Control", "private, no-store")
  @HttpCode(202)
  async create(@Req() request:AuditRequest,@Param("runId") runId:string,@Query() query:unknown,@Body() body:unknown){
    const token=request.headers[CSRF_HEADER],cookie=csrfCookieFrom(request);
    if(typeof request.headers.origin!=="string"||!originAllowed(request,this.config.PORTAL_PUBLIC_ORIGIN)
      ||typeof token!=="string"||!cookie||!constantTimeEqual(token,cookie)
      ||!constantTimeEqual(sha256(token),request.portalSession.csrfSecretHash))
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_FORBIDDEN","Origin or CSRF proof is invalid.",403);
    const input=ResearchFinalAuditCreateSchema.safeParse(body);
    if(!input.success)throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_INVALID","Invalid audit intent.",400);
    return this.service.create(request.portalUser,await this.scope(request,runId,query),runId,input.data,String(request.id));
  }
}
