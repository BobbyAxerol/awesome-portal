/** P15 same-origin current-source Search BFF route. */

import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchSearchReadQuerySchema, ResearchSearchRunIdSchema } from "./search.contract";
import { ResearchSearchError } from "./search.error";
import { ResearchSearchService } from "./search.service";

interface SearchRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchSearchController {
  constructor(
    @Inject(ResearchSearchService) private readonly service: ResearchSearchService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":runId/search")
  async detail(
    @Req() request: SearchRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = ResearchSearchReadQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    const body = await this.service.detail(
      { workspaceId, actorUserId: request.portalUser.userId },
      runId,
      { ...(query.data.fold === undefined ? {} : { fold: query.data.fold }) },
    );
    if (body.etag) {
      reply.header("etag", body.etag);
      const candidate = request.headers["if-none-match"];
      if (!Array.isArray(candidate) && candidate === body.etag) return reply.code(304).send();
    }
    return reply.send(body);
  }

  private runId(raw: string): string {
    if (!ResearchSearchRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private invalid(): never {
    throw new ResearchSearchError("RESEARCH_SEARCH_INVALID", "Invalid Research Search request.", 400);
  }

  private async workspace(request: SearchRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchSearchError("RESEARCH_SEARCH_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }
}
