import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import {
  AlphaFleetQuerySchema, BindingsQuerySchema, MANAGER_LIST_ENVIRONMENTS,
} from "./contracts";
import { ManagerListsError, ManagerListsService } from "./manager-lists.service";

interface ManagerListRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ManagerListsController {
  constructor(
    @Inject(ManagerListsService) private readonly lists: ManagerListsService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/alphas")
  async fleet(@Req() request: ManagerListRequest, @Query() raw: unknown) {
    const parsed = AlphaFleetQuerySchema.safeParse(raw);
    if (!parsed.success) throw new ManagerListsError("BR72_FLEET_QUERY_INVALID", 400);
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.lists.fleet({ user: request.portalUser, session: request.portalSession, workspaceId }, parsed.data);
  }

  @Get("/broker-bindings")
  async bindings(@Req() request: ManagerListRequest, @Query() raw: unknown) {
    const parsed = BindingsQuerySchema.safeParse(raw);
    if (!parsed.success) throw new ManagerListsError("BR72_BINDINGS_QUERY_INVALID", 400);
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.lists.bindings({ user: request.portalUser, session: request.portalSession, workspaceId }, parsed.data);
  }

  @Get("/broker-bindings/:binding_id")
  async binding(
    @Req() request: ManagerListRequest,
    @Param("binding_id") bindingId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
    @Query("environment") rawEnvironment?: unknown,
  ) {
    if (!bindingId || bindingId.length > 160) throw new ManagerListsError("BR72_BINDING_ID_INVALID", 400);
    const environment = typeof rawEnvironment === "string" ? rawEnvironment : "paper";
    if (!(MANAGER_LIST_ENVIRONMENTS as readonly string[]).includes(environment)) {
      throw new ManagerListsError("BR72_BINDING_ENVIRONMENT_INVALID", 400);
    }
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.lists.binding(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      environment as "paper" | "sandbox" | "live",
      bindingId,
    );
  }

  private async workspace(request: ManagerListRequest, raw: unknown): Promise<string> {
    const workspaceId = typeof raw === "string" && raw ? raw : request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ManagerListsError("WORKSPACE_NOT_FOUND", 404);
    }
    return workspaceId;
  }
}
