/** P22 named publication lookup for one Alpha version. */
import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchReleaseCandidateReadQuerySchema } from "./release-candidate.contract";
import { ResearchReleaseCandidateError } from "./release-candidate.error";
import { ResearchReleaseCandidatePublicationService } from "./release-candidate-publication.service";

interface PublicationRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/research/alpha-versions")
export class ResearchAlphaVersionPublicationController {
  constructor(
    private readonly service: ResearchReleaseCandidatePublicationService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":alphaVersionId/publication")
  async publication(
    @Req() request: PublicationRequest, @Res() reply: FastifyReply,
    @Param("alphaVersionId") rawId: string, @Query() rawQuery: unknown,
  ) {
    if (!/^av_[A-Za-z0-9._-]{1,187}$/.test(rawId)) {
      throw new ResearchReleaseCandidateError(
        "RESEARCH_RELEASE_CANDIDATE_INVALID", "Invalid Alpha version publication request.", 400,
      );
    }
    const parsed = ResearchReleaseCandidateReadQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new ResearchReleaseCandidateError(
        "RESEARCH_RELEASE_CANDIDATE_INVALID", "Invalid Alpha version publication request.", 400,
      );
    }
    const workspaceId = parsed.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchReleaseCandidateError(
        "RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Alpha version publication was not found.", 404,
      );
    }
    const result = await this.service.alphaVersionPublication(
      { workspaceId, actorUserId: request.portalUser.userId }, request.portalUser, rawId,
    );
    reply.header("cache-control", "private, no-store");
    return reply.send(result);
  }
}
