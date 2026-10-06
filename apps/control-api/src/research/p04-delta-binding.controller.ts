import { Body, Controller, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";

import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchRunCreateError } from "./run-create.error";
import { ResearchP04DeltaBindingService } from "./p04-delta-binding.service";

const InstallRequestSchema = z.object({
  workspace_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional(),
}).strict();

interface P04BindingRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { sessionId: string; csrfSecretHash: string };
}
/** P10 explicit, same-origin setup for the one compiled P04 adapter. */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/run-producer/p04-delta")
export class ResearchP04DeltaBindingController {
  constructor(
    @Inject(ResearchP04DeltaBindingService) private readonly service: ResearchP04DeltaBindingService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Post("install")
  @HttpCode(200)
  async install(@Req() request: P04BindingRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = InstallRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.service.install(
      request.portalUser,
      { workspaceId, actorUserId: request.portalUser.userId },
      this.config.FEATURE_RESEARCH_FULL03_PROFILE === "true",
      this.config.FEATURE_RESEARCH_FULL06_PROFILE === "true",
    );
  }

  private invalid(): never {
    throw new ResearchRunCreateError("RESEARCH_RUN_CREATE_INVALID", "Invalid Research P04 binding request.", 400);
  }

  private async workspace(request: P04BindingRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchRunCreateError("RESEARCH_RUN_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: P04BindingRequest): void {
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
}
