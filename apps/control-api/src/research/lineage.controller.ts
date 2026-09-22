/** P19 same-origin, read-only Screen-10 Attempt Lineage route. */

import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchAttemptLineageQuerySchema } from "./lineage.contract";
import { ResearchLineageError } from "./lineage.error";
import { ResearchLineageService } from "./lineage.service";

interface LineageRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

/**
 * Browser receives a named Alpha Lineage operation only.  It cannot submit a
 * graph edge, source fact, promotion pick, raw config payload, relation name,
 * cursor, worker identity, or source transport input through this surface.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/alphas")
export class ResearchLineageController {
  constructor(
    private readonly service: ResearchLineageService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":alphaId/lineage")
  async read(
    @Req() request: LineageRequest,
    @Param("alphaId") alphaId: string,
    @Query() rawQuery: unknown,
  ) {
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(alphaId)) this.invalid();
    const query = ResearchAttemptLineageQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.read(
      { workspaceId, actorUserId: request.portalUser.userId },
      alphaId,
      { ...query.data, workspace_id: workspaceId },
    );
  }

  private invalid(): never {
    throw new ResearchLineageError("RESEARCH_LINEAGE_INVALID", "Invalid Research Attempt Lineage request.", 400);
  }

  private async workspace(request: LineageRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      // Match other Research readers: do not turn this endpoint into a
      // workspace/Alpha existence oracle for a session that cannot observe it.
      throw new ResearchLineageError("RESEARCH_LINEAGE_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }
}
