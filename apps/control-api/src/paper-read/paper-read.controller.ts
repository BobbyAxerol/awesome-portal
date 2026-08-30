import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import {
  PaperBlotterQuerySchema,
  PaperDeploymentIdSchema,
  PaperOverviewQuerySchema,
  PaperWorkbenchQuerySchema,
} from "./contracts";
import { PaperReadError, PaperReadService } from "./paper-read.service";

interface PaperReadRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/screens")
export class PaperReadController {
  constructor(
    @Inject(PaperReadService) private readonly paper: PaperReadService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/paper")
  async overview(@Req() request: PaperReadRequest, @Query() raw: unknown) {
    const query = PaperOverviewQuerySchema.safeParse(raw);
    if (!query.success) throw invalidQuery();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.paper.overview(this.principal(request, workspaceId));
  }

  @Get("/paper/:deployment_id")
  async workbench(
    @Req() request: PaperReadRequest,
    @Param("deployment_id") rawDeploymentId: string,
    @Query() raw: unknown,
  ) {
    return this.deploymentScreen(request, rawDeploymentId, raw, false);
  }

  @Get("/paper/:deployment_id/vn-market")
  async workbenchVnm(
    @Req() request: PaperReadRequest,
    @Param("deployment_id") rawDeploymentId: string,
    @Query() raw: unknown,
  ) {
    return this.deploymentScreen(request, rawDeploymentId, raw, true);
  }

  @Get("/blotter")
  async blotter(@Req() request: PaperReadRequest, @Query() raw: unknown) {
    const query = PaperBlotterQuerySchema.safeParse(raw);
    if (!query.success) throw invalidQuery();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.paper.blotter(this.principal(request, workspaceId), query.data);
  }

  private async deploymentScreen(
    request: PaperReadRequest,
    rawDeploymentId: string,
    raw: unknown,
    vnm: boolean,
  ) {
    const query = PaperWorkbenchQuerySchema.safeParse(raw);
    const deploymentId = PaperDeploymentIdSchema.safeParse(rawDeploymentId);
    if (!query.success || !deploymentId.success) throw invalidQuery();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.paper.workbench(this.principal(request, workspaceId), deploymentId.data, vnm);
  }

  private async workspace(request: PaperReadRequest, requested?: string): Promise<string> {
    const workspaceId = requested ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new PaperReadError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }

  private principal(request: PaperReadRequest, workspaceId: string) {
    return { user: request.portalUser, session: request.portalSession, workspaceId };
  }
}

function invalidQuery(): PaperReadError {
  return new PaperReadError("N22_QUERY_INVALID", "Invalid Paper screen query.", 400);
}
