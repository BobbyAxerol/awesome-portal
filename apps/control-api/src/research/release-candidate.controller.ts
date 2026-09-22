/** P21 same-origin Release Candidate compose/draft/local-seal BFF routes. */

import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ResearchReleaseCandidateDraftPatchSchema,
  ResearchReleaseCandidateIdSchema,
  ResearchReleaseCandidateReadQuerySchema,
  ResearchReleaseCandidateRunIdSchema,
  ResearchReleaseCandidateSealSchema,
} from "./release-candidate.contract";
import { ResearchReleaseCandidateError } from "./release-candidate.error";
import { ResearchReleaseCandidateService } from "./release-candidate.service";

interface ReleaseCandidateRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
  portalSession: { csrfSecretHash: string };
}

/**
 * The browser can name only a run or an opaque local RC id.  It cannot pass a
 * relation/cursor, artifact path, final-audit child, digest, approval state,
 * worker identity or an Execution payload. P22 owns actual publish intent.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1")
export class ResearchReleaseCandidateController {
  constructor(
    private readonly service: ResearchReleaseCandidateService,
    private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("quantbt/runs/:runId/release-candidate")
  async detail(
    @Req() request: ReleaseCandidateRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = this.query(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    const body = await this.service.detail({ workspaceId, actorUserId: request.portalUser.userId }, runId);
    reply.header("cache-control", "private, no-store");
    reply.header("etag", `\"${body.source_fingerprint}\"`);
    return reply.send(body);
  }

  @Patch("quantbt/runs/:runId/release-candidate/draft")
  async patchDraft(
    @Req() request: ReleaseCandidateRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
    @Body() rawBody: unknown,
  ) {
    this.assertActionSecurity(request);
    const runId = this.runId(rawRunId);
    const query = this.query(rawQuery);
    const input = ResearchReleaseCandidateDraftPatchSchema.safeParse({
      ...(rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {}),
      ...(query.workspace_id === undefined ? {} : { workspace_id: query.workspace_id }),
    });
    if (!input.success) this.invalid();
    const workspaceId = await this.workspace(request, input.data.workspace_id);
    return this.service.patchDraft({ workspaceId, actorUserId: request.portalUser.userId }, runId, input.data);
  }

  @Post("quantbt/runs/:runId/release-candidate/seal")
  @HttpCode(201)
  async seal(
    @Req() request: ReleaseCandidateRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
    @Body() rawBody: unknown,
  ) {
    this.assertActionSecurity(request);
    const runId = this.runId(rawRunId);
    const query = this.query(rawQuery);
    const input = ResearchReleaseCandidateSealSchema.safeParse({
      ...(rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {}),
      ...(query.workspace_id === undefined ? {} : { workspace_id: query.workspace_id }),
    });
    if (!input.success) this.invalid();
    const workspaceId = await this.workspace(request, input.data.workspace_id);
    return this.service.seal({ workspaceId, actorUserId: request.portalUser.userId }, runId, input.data);
  }

  @Get("research/release-candidates/:releaseCandidateId")
  async pack(
    @Req() request: ReleaseCandidateRequest,
    @Res() reply: FastifyReply,
    @Param("releaseCandidateId") rawReleaseCandidateId: string,
    @Query() rawQuery: unknown,
  ) {
    if (!ResearchReleaseCandidateIdSchema.safeParse(rawReleaseCandidateId).success) this.invalid();
    const query = this.query(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    const body = await this.service.pack({ workspaceId, actorUserId: request.portalUser.userId }, rawReleaseCandidateId);
    reply.header("cache-control", "private, no-store");
    reply.header("etag", `\"${body.pack_digest}\"`);
    return reply.send(body);
  }

  private runId(raw: string): string {
    if (!ResearchReleaseCandidateRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private query(raw: unknown) {
    const parsed = ResearchReleaseCandidateReadQuerySchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }

  private invalid(): never {
    throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_INVALID", "Invalid Release Candidate request.", 400);
  }

  private async workspace(request: ReleaseCandidateRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      // Foreign run/RC IDs are never exposed as a membership oracle.
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Release Candidate was not found.", 404);
    }
    return workspaceId;
  }

  private assertActionSecurity(request: ReleaseCandidateRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
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
