/** P22 same-origin publication and read-only existing-R1 mirror routes. */
import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { newUlid } from "../id";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchReleaseCandidateIdSchema, ResearchReleaseCandidateReadQuerySchema } from "./release-candidate.contract";
import { ResearchReleaseCandidatePublishRequestSchema } from "./release-candidate-publication.contract";
import { ResearchReleaseCandidateError } from "./release-candidate.error";
import { ResearchReleaseCandidatePublicationService } from "./release-candidate-publication.service";

interface PublicationRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/research/release-candidates")
export class ResearchReleaseCandidatePublicationController {
  constructor(
    private readonly service: ResearchReleaseCandidatePublicationService,
    private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get(":releaseCandidateId/publication")
  async publication(
    @Req() request: PublicationRequest, @Res() reply: FastifyReply,
    @Param("releaseCandidateId") rawId: string, @Query() rawQuery: unknown,
  ) {
    const id = this.id(rawId);
    const query = this.query(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    const result = await this.service.publication(
      { workspaceId, actorUserId: request.portalUser.userId }, request.portalUser, id,
    );
    reply.header("cache-control", "private, no-store");
    return reply.send(result);
  }

  @Post(":releaseCandidateId/publish")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  async publish(
    @Req() request: PublicationRequest, @Param("releaseCandidateId") rawId: string,
    @Query() rawQuery: unknown, @Body() rawBody: unknown,
  ) {
    this.assertMutationSecurity(request);
    const id = this.id(rawId);
    const query = this.query(rawQuery);
    const parsed = ResearchReleaseCandidatePublishRequestSchema.safeParse(rawBody);
    if (!parsed.success) this.invalid();
    if (query.workspace_id !== undefined && parsed.data.workspace_id !== undefined
      && query.workspace_id !== parsed.data.workspace_id) this.invalid();
    const input = { ...parsed.data, ...(query.workspace_id === undefined ? {} : { workspace_id: query.workspace_id }) };
    const workspaceId = await this.workspace(request, input.workspace_id);
    const requestId = typeof request.id === "string" && request.id.length > 0 && request.id.length <= 128
      ? request.id : newUlid("req");
    return this.service.publish(
      { workspaceId, actorUserId: request.portalUser.userId }, request.portalUser, id, input, requestId,
    );
  }

  private id(value: string): string {
    if (!ResearchReleaseCandidateIdSchema.safeParse(value).success) this.invalid();
    return value;
  }
  private query(raw: unknown) {
    const parsed = ResearchReleaseCandidateReadQuerySchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }
  private invalid(): never {
    throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_INVALID", "Invalid publication request.", 400);
  }
  private async workspace(request: PublicationRequest, raw: string | undefined): Promise<string> {
    const workspaceId = raw ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Release Candidate was not found.", 404);
    }
    return workspaceId;
  }
  private assertMutationSecurity(request: PublicationRequest): void {
    if (typeof request.headers.origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie)
      || !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_FORBIDDEN", "CSRF token is invalid.", 403);
    }
  }
}
