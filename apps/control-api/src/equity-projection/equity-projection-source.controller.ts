import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { OperationalReadError } from "../operations/current-operational-read";
import { WorkspacesRepository } from "../repos/workspaces";
import { EquityProjectionSourceReads } from "./equity-projection-source.service";

interface EquityRequest extends FastifyRequest { portalUser: PortalUser; portalWorkspaceId: string; portalSession: AuthSession; }

/** UNMOUNTED by default (see AppModule `equityProjectionSource`). Sibling of the fixture-only V1 route, not a replacement. */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class EquityProjectionSourceController {
  constructor(@Inject(EquityProjectionSourceReads) private readonly reads: EquityProjectionSourceReads,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  @Get("/deployments/:deployment_id/equity-projection/source")
  @Header("Cache-Control", "private, no-store")
  async detail(@Req() request: EquityRequest, @Param("deployment_id") deploymentId: string, @Query() query: Record<string, unknown>) {
    const raw = query?.workspace_id;
    if (typeof raw !== "string" || !/^[A-Za-z0-9._:-]{1,96}$/.test(raw)) throw new OperationalReadError("OPERATIONAL_READ_INPUT_INVALID", 400);
    if (!(await this.workspaces.isMember(raw, request.portalUser.userId))) throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    return this.reads.detail({ user: request.portalUser, session: request.portalSession, workspaceId: raw, viewerWorkspaceId: request.portalWorkspaceId },
      deploymentId, query);
  }
}
