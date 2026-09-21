/** P14 same-origin Split / chronology BFF route. */

import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchSplitReadQuerySchema, ResearchSplitRunIdSchema } from "./split.contract";
import { ResearchSplitError } from "./split.error";
import { ResearchSplitService } from "./split.service";

interface SplitRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchSplitController {
  constructor(
    @Inject(ResearchSplitService) private readonly service: ResearchSplitService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":runId/split")
  async detail(
    @Req() request: SplitRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = ResearchSplitReadQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    const body = await this.service.detail({ workspaceId, actorUserId: request.portalUser.userId }, runId);
    if (body.etag) {
      reply.header("etag", body.etag);
      const candidate = request.headers["if-none-match"];
      if (!Array.isArray(candidate) && candidate === body.etag) return reply.code(304).send();
    }
    return reply.send(body);
  }

  private runId(raw: string): string {
    if (!ResearchSplitRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private invalid(): never {
    throw new ResearchSplitError("RESEARCH_SPLIT_INVALID", "Invalid Research Split request.", 400);
  }

  private async workspace(request: SplitRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchSplitError("RESEARCH_SPLIT_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }
}
