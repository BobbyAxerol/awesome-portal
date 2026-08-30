import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { CanaryEnvelopeCreateRequestSchema } from "./contracts";
import { CanaryService } from "./canary.service";

interface CanaryRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession & { csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class CanaryController {
  constructor(
    @Inject(CanaryService) private readonly canary: CanaryService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/deployments/:deployment_id/canary")
  async detail(
    @Req() request: CanaryRequest,
    @Param("deployment_id") deploymentId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.canary.detail(request.portalUser, request.portalSession, workspaceId, deploymentId);
  }

  @Post("/governance/canary-envelopes")
  @HttpCode(201)
  async create(@Req() request: CanaryRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = CanaryEnvelopeCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new GovernanceError("INVALID_CANARY_ENVELOPE_CREATE", "Invalid canary envelope create request.", 400);
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.canary.create(
      request.portalUser,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  private async workspace(request: CanaryRequest, raw: unknown): Promise<string> {
    const workspaceId = raw === undefined || raw === null || raw === ""
      ? request.portalWorkspaceId
      : typeof raw === "string" && raw.length <= 96 ? raw : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: CanaryRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new GovernanceError("ORIGIN_DENIED", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (
      !header || !cookie || !constantTimeEqual(header, cookie) ||
      !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)
    ) {
      throw new GovernanceError("CSRF_INVALID", "CSRF token is invalid.", 403);
    }
  }

  private requestId(request: CanaryRequest): string {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && value.length <= 191 ? value : "request-unset";
  }
}
