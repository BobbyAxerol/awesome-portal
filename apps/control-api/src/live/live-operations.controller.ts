import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { WorkspacesRepository } from "../repos/workspaces";
import { LiveOperationsService } from "./live-operations.service";

interface LiveRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalViewerWorkspaceId?: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class LiveOperationsController {
  constructor(
    @Inject(LiveOperationsService) private readonly live: LiveOperationsService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/deployments/:deployment_id/live")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Req() request: LiveRequest,
    @Param("deployment_id") deploymentId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
    @Query("panel") rawPanel?:unknown,
    @Query("cursor") rawCursor?:unknown,
    // BE-P12: SCOPED_V2 only. The legacy body already carries identity and stage facts, so it ignores this.
    @Query("include") rawInclude?:unknown,
  ) {
    const workspaceId = rawWorkspaceId === undefined || rawWorkspaceId === null || rawWorkspaceId === ""
      ? request.portalWorkspaceId
      : typeof rawWorkspaceId === "string" && rawWorkspaceId.length <= 96 ? rawWorkspaceId : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return this.live.detail(request.portalUser, request.portalSession, workspaceId, deploymentId,
      request.portalViewerWorkspaceId ?? request.portalWorkspaceId,{panel:rawPanel,cursor:rawCursor,include:rawInclude});
  }
}
