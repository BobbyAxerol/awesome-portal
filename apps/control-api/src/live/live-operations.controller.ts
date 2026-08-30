import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { WorkspacesRepository } from "../repos/workspaces";
import { LiveOperationsService } from "./live-operations.service";

interface LiveRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
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
  async detail(
    @Req() request: LiveRequest,
    @Param("deployment_id") deploymentId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = rawWorkspaceId === undefined || rawWorkspaceId === null || rawWorkspaceId === ""
      ? request.portalWorkspaceId
      : typeof rawWorkspaceId === "string" && rawWorkspaceId.length <= 96 ? rawWorkspaceId : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return this.live.detail(request.portalUser, request.portalSession, workspaceId, deploymentId);
  }
}
