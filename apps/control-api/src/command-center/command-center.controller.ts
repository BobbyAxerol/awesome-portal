import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CommandCenterError, CommandCenterService } from "./command-center.service";

interface CommandCenterRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class CommandCenterController {
  constructor(
    @Inject(CommandCenterService) private readonly service: CommandCenterService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/command-center")
  async snapshot(
    @Req() request: CommandCenterRequest,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = rawWorkspaceId === undefined || rawWorkspaceId === null || rawWorkspaceId === ""
      ? request.portalWorkspaceId
      : typeof rawWorkspaceId === "string" && rawWorkspaceId.length <= 96
        ? rawWorkspaceId
        : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new CommandCenterError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return this.service.snapshot(request.portalUser, workspaceId);
  }
}
