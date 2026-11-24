import { Controller, Get, Header, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionReadScopeError } from "./read-scope";
import { ObservedReadError, observedOverviewQuery } from "./observed-read.contract";
import { ObservedReadService } from "./observed-read.service";

interface ObservedRequest extends FastifyRequest {
  portalUser: PortalUser; portalSession: AuthSession; portalWorkspaceId: string; portalViewerWorkspaceId?: string;
}

/**
 * Closed named GETs, no relation/URL/SQL selector (same rule as manager-model.controller.ts).
 * Registered only when FEATURE_EXECUTION_OBSERVED_READ is on; the service also refuses when it is off.
 * Same workspace gate as the legacy lists: canReadExecution, pinned to the projection workspace.
 */
@Controller("/api/v1/execution/observed")
@UseGuards(SessionGuard)
export class ObservedReadController {
  constructor(
    @Inject(ObservedReadService) private readonly observed: ObservedReadService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/overview") @Header("Cache-Control", "private, no-store")
  async overview(@Req() request: ObservedRequest, @Query() raw: unknown) {
    if (!this.observed.enabled()) throw new ObservedReadError("EXECUTION_OBSERVED_READ_DISABLED", 404);
    const parsed = observedOverviewQuery.safeParse(raw ?? {});
    if (!parsed.success) throw new ObservedReadError("EXECUTION_OBSERVED_QUERY_INVALID", 400);
    const query = parsed.data;
    const workspace = query.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.canReadExecution(workspace, request.portalUser.userId, query.environment)))
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    // The observed lane reads the single retained projection workspace, like resource-read.
    if (!this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID || workspace !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID)
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    return this.observed.overview({
      user: request.portalUser, session: request.portalSession, workspaceId: workspace,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId,
    }, query.environment);
  }
}
