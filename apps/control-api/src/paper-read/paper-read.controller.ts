import { Controller, Logger, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { screenEnvelopeV2From, screenResponseMetrics, wantsScreenV2 } from "../execution/screen-envelope-v2";
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
  private readonly screenLog = new Logger("ExecutionScreenResponse");

  constructor(
    @Inject(PaperReadService) private readonly paper: PaperReadService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/paper")
  async overview(@Req() request: PaperReadRequest, @Query() raw: unknown) {
    const query = PaperOverviewQuerySchema.safeParse(raw);
    if (!query.success) throw invalidQuery();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.negotiate(request, await this.paper.overview(this.principal(request, workspaceId)));
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
    return this.negotiate(request, await this.paper.blotter(this.principal(request, workspaceId), query.data));
  }

  /**
   * V2 is the envelope the services build. A caller that does not ask for the
   * V2 media type gets V1 rebuilt from it, so the duplicate branch exists only
   * in the legacy response and never alongside V2.
   */
  private negotiate(request: FastifyRequest, envelope: unknown): unknown {
    const v1 = envelope as Record<string, unknown>;
    const wantsV2 = wantsScreenV2(request.headers.accept);
    const body = wantsV2 ? screenEnvelopeV2From(v1) : v1;
    const operation = String(v1.schema_version ?? "unknown").replace(/\.v[12]$/, "");
    // Per named operation, so the label set stays bounded no matter how many
    // deployments or workspaces exist.
    this.screenLog.log(JSON.stringify({
      event: "execution_screen_response",
      ...screenResponseMetrics(operation, wantsV2 ? "v2" : "v1", body),
    }));
    return body;
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
    return this.negotiate(request, await this.paper.workbench(this.principal(request, workspaceId), deploymentId.data, vnm));
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
