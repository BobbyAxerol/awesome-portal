/** P13 same-origin Evidence Flow Hub BFF routes. */

import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import {
  ResearchEvidenceReadQuerySchema,
  ResearchEvidenceRunIdSchema,
  ResearchEvidenceSeriesQuerySchema,
} from "./evidence.contract";
import { ResearchEvidenceError } from "./evidence.error";
import { ResearchEvidenceService } from "./evidence.service";

interface EvidenceRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
}
@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchEvidenceController {
  constructor(
    @Inject(ResearchEvidenceService) private readonly service: ResearchEvidenceService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":runId/evidence")
  async hub(
    @Req() request: EvidenceRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = ResearchEvidenceReadQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    const body = await this.service.hub({ workspaceId, actorUserId: request.portalUser.userId }, runId);
    return this.conditional(reply, request, body.etag, body);
  }

  @Get(":runId/evidence/series")
  async series(
    @Req() request: EvidenceRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = ResearchEvidenceSeriesQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    const body = await this.service.series(
      { workspaceId, actorUserId: request.portalUser.userId }, runId, query.data.kind,
    );
    return this.conditional(reply, request, body.etag, body);
  }

  private conditional(reply: FastifyReply, request: FastifyRequest, etag: string | null, body: unknown) {
    if (etag) {
      reply.header("etag", etag);
      const candidate = request.headers["if-none-match"];
      if (!Array.isArray(candidate) && candidate === etag) return reply.code(304).send();
    }
    return reply.send(body);
  }

  private runId(raw: string): string {
    if (!ResearchEvidenceRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private invalid(): never {
    throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INVALID", "Invalid Research Evidence request.", 400);
  }

  private async workspace(request: EvidenceRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }
}
