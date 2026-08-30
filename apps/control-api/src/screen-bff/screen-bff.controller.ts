import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ScreenBffDetailQuerySchema, ScreenBffWorkspaceQuerySchema } from "./contracts";
import { ScreenBffError, ScreenBffService } from "./screen-bff.service";

interface ScreenBffRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/screen-contracts")
export class ScreenBffController {
  constructor(
    @Inject(ScreenBffService) private readonly service: ScreenBffService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get()
  async catalogue(@Req() request: ScreenBffRequest, @Query() rawQuery: unknown) {
    const query = ScreenBffWorkspaceQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new ScreenBffError("N20_QUERY_INVALID", "Invalid query.", 400);
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.catalogue(request.portalUser, workspaceId);
  }

  @Get("/:screen_id")
  async detail(
    @Req() request: ScreenBffRequest,
    @Param("screen_id") screenId: string,
    @Query() rawQuery: unknown,
  ) {
    const query = ScreenBffDetailQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new ScreenBffError("N20_QUERY_INVALID", "Invalid query.", 400);
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.detail(request.portalUser, workspaceId, screenId, query.data.resource_id);
  }

  private async workspace(request: ScreenBffRequest, requested?: string): Promise<string> {
    const workspaceId = requested ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ScreenBffError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }
}
