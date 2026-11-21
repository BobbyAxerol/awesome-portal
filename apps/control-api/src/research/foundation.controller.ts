import { Controller, Get, Inject, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";

import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchAtlasQuerySchema, ResearchJourneyQuerySchema } from "./foundation.contract";
import { ResearchFoundationError } from "./foundation.error";
import { asResearchFoundationError, ResearchFoundationService } from "./foundation.service";

interface FoundationRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}
/** P09 read-only same-origin BFF. Browser code never sees the private Atlas hop. */
@UseGuards(SessionGuard)
@Controller("/api/v1/research")
export class ResearchFoundationController {
  constructor(
    @Inject(ResearchFoundationService) private readonly service: ResearchFoundationService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("journey")
  async journey(
    @Req() request: FoundationRequest,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const query = ResearchJourneyQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    try {
      const payload = await this.service.journey(
        { workspaceId, actorUserId: request.portalUser.userId },
        query.data,
      );
      return this.withEtag(request, reply, payload);
    } catch (error) {
      return asResearchFoundationError(error);
    }
  }

  @Get("quantbt/atlas")
  async atlas(
    @Req() request: FoundationRequest,
    @Query() rawQuery: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const query = ResearchAtlasQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    await this.workspace(request, query.data.workspace_id);
    try {
      const payload = await this.service.atlas(request.portalUser, query.data);
      return this.withEtag(request, reply, payload);
    } catch (error) {
      return asResearchFoundationError(error);
    }
  }

  private invalid(): never {
    throw new ResearchFoundationError("RESEARCH_FOUNDATION_INVALID", "Invalid Research foundation read request.", 400);
  }

  private async workspace(request: FoundationRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchFoundationError("RESEARCH_FOUNDATION_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }

  private withEtag<T extends { etag: string }>(request: FastifyRequest, reply: FastifyReply, payload: T): T | undefined {
    reply.header("etag", payload.etag);
    reply.header("cache-control", "private, max-age=0, must-revalidate");
    if (request.headers["if-none-match"] === payload.etag) {
      reply.code(304);
      return undefined;
    }
    return payload;
  }
}
