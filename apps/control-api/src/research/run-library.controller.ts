/** P12 same-origin, session-scoped Run Library read routes. */

import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";

import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import {
  ResearchRunIdSchema,
  ResearchRunLibraryQuerySchema,
  ResearchRunLibraryWorkspaceQuerySchema,
} from "./run-library.contract";
import { ResearchRunLibraryError } from "./run-library.error";
import { ResearchRunLibraryService } from "./run-library.service";

interface RunLibraryRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

/**
 * The browser sees only named Screen-01 operations.  It never receives a
 * relation name, database cursor, source lease, worker attempt, artifact path
 * or any input that could turn the persisted reader into a query console.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchRunLibraryController {
  constructor(
    private readonly service: ResearchRunLibraryService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get()
  async list(@Req() request: RunLibraryRequest, @Query() rawQuery: unknown) {
    const query = ResearchRunLibraryQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.list(
      { workspaceId, actorUserId: request.portalUser.userId },
      { ...query.data, workspace_id: workspaceId },
    );
  }

  @Get(":runId/sparkline")
  async sparkline(
    @Req() request: RunLibraryRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    if (!ResearchRunIdSchema.safeParse(rawRunId).success) this.invalid();
    const query = ResearchRunLibraryWorkspaceQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.sparkline({ workspaceId, actorUserId: request.portalUser.userId }, rawRunId);
  }

  private invalid(): never {
    throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_INVALID", "Invalid Research Run Library request.", 400);
  }

  private async workspace(request: RunLibraryRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      // Match the other Research readers: an unobservable workspace is a 404,
      // not an existence oracle.  The repository repeats the membership check
      // under its transaction for a race-safe data boundary.
      throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }
}
