/**
 * W5a · A10c — the one explicit what-if action on Screen 07.
 *
 * `POST …/current-source/freeze/what-if/evaluate` is origin/CSRF-protected
 * and admits at most one bounded diagnostic job. There is no GET here: the
 * grid is part of the current-source freeze read, which never evaluates.
 */

import { Body, Controller, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchCurrentSourceReadQuerySchema, ResearchCurrentSourceRunIdSchema } from "./current-source.contract";
import { ResearchCurrentSourceService } from "./current-source.service";
import { ResearchWhatIfEvaluateRequestSchema } from "./whatif.contract";
import { ResearchWhatIfError } from "./whatif.error";
import { ResearchWhatIfService } from "./whatif.service";

interface WhatIfRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchWhatIfController {
  constructor(
    @Inject(ResearchWhatIfService) private readonly service: ResearchWhatIfService,
    @Inject(ResearchCurrentSourceService) private readonly currentSource: ResearchCurrentSourceService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Post(":runId/current-source/freeze/what-if/evaluate")
  @HttpCode(200)
  async evaluate(
    @Req() request: WhatIfRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
    @Body() body: unknown,
  ) {
    this.assertActionSecurity(request);
    if (!ResearchCurrentSourceRunIdSchema.safeParse(rawRunId).success) this.invalid();
    const query = ResearchCurrentSourceReadQuerySchema.safeParse(rawQuery ?? {});
    if (!query.success) this.invalid();
    const parsed = ResearchWhatIfEvaluateRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_NOT_FOUND", "Research workspace was not found.", 404);
    }
    const scope = { workspaceId, actorUserId: request.portalUser.userId };
    const basis = await this.currentSource.whatIfBasis(scope, rawRunId);
    const requestId = String(request.headers["x-request-id"] ?? request.id ?? "research-whatif");
    return this.service.evaluate(request.portalUser, scope, basis, parsed.data.grid_key, requestId);
  }

  private invalid(): never {
    throw new ResearchWhatIfError("RESEARCH_WHATIF_INVALID", "Invalid what-if request.", 400);
  }

  private assertActionSecurity(request: WhatIfRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_FORBIDDEN", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie)
      || !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_FORBIDDEN", "CSRF token is invalid.", 403);
    }
  }
}
