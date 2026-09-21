import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";

import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { newUlid } from "../id";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchRunCreateRequestSchema } from "./run-create.contract";
import { ResearchRunCreateError } from "./run-create.error";
import { ResearchRunCreateService } from "./run-create.service";

interface ResearchRunCreateHttpRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { sessionId: string; csrfSecretHash: string };
}

/** P10 browser ingress. It is same-origin only; Portal receives a private HMAC hop. */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/runs")
export class ResearchRunCreateController {
  constructor(
    @Inject(ResearchRunCreateService) private readonly service: ResearchRunCreateService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Post()
  @HttpCode(202)
  async create(@Req() request: ResearchRunCreateHttpRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = ResearchRunCreateRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.service.create(
      request.portalUser,
      { workspaceId, actorUserId: request.portalUser.userId },
      parsed.data,
      this.requestId(request),
    );
  }

  private invalid(): never {
    throw new ResearchRunCreateError("RESEARCH_RUN_CREATE_INVALID", "Invalid Research run creation request.", 400);
  }

  private async workspace(request: ResearchRunCreateHttpRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchRunCreateError("RESEARCH_RUN_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: ResearchRunCreateHttpRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchRunCreateError("RESEARCH_RUN_CREATE_FORBIDDEN", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie) ||
        !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchRunCreateError("RESEARCH_RUN_CREATE_FORBIDDEN", "CSRF token is invalid.", 403);
    }
  }

  private requestId(request: ResearchRunCreateHttpRequest): string {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
      ? value : newUlid("req");
  }
}
