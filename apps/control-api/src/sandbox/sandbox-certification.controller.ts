import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  SandboxCertificationCreateRequestSchema,
  SandboxCertificationDecisionRequestSchema,
  SandboxCertificationSubmitRequestSchema,
  SandboxPromotionPlanRequestSchema,
} from "./contracts";
import { SandboxCertificationService } from "./sandbox-certification.service";

interface SandboxRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { sessionId: string; csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class SandboxCertificationController {
  constructor(
    @Inject(SandboxCertificationService) private readonly certifications: SandboxCertificationService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/deployments/:deployment_id/certification")
  async detail(
    @Req() request: SandboxRequest,
    @Param("deployment_id") deploymentId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.certifications.detail(request.portalUser, workspaceId, deploymentId);
  }

  @Post("/governance/sandbox-certifications")
  @HttpCode(201)
  async create(@Req() request: SandboxRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = SandboxCertificationCreateRequestSchema.safeParse(body);
    if (!parsed.success) throw new GovernanceError(
      "INVALID_SANDBOX_CERTIFICATION_CREATE",
      "Invalid sandbox certification create request.",
      400,
    );
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.certifications.create(
      request.portalUser,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Post("/governance/sandbox-certifications/:certification_id/submit")
  @HttpCode(201)
  async submit(
    @Req() request: SandboxRequest,
    @Param("certification_id") certificationId: string,
    @Body() body: unknown,
  ) {
    this.assertMutationSecurity(request);
    const parsed = SandboxCertificationSubmitRequestSchema.safeParse(body);
    if (!parsed.success) throw new GovernanceError(
      "INVALID_SANDBOX_CERTIFICATION_SUBMIT",
      "Invalid sandbox certification submit request.",
      400,
    );
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.certifications.submit(
      request.portalUser,
      certificationId,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Post("/governance/sandbox-certifications/:certification_id/decisions")
  @HttpCode(201)
  async decide(
    @Req() request: SandboxRequest,
    @Param("certification_id") certificationId: string,
    @Body() body: unknown,
  ) {
    this.assertMutationSecurity(request);
    const parsed = SandboxCertificationDecisionRequestSchema.safeParse(body);
    if (!parsed.success) throw new GovernanceError(
      "INVALID_SANDBOX_CERTIFICATION_DECISION",
      "Invalid sandbox certification decision request.",
      400,
    );
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.certifications.decide(
      request.portalUser,
      certificationId,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Post("/governance/sandbox-certifications/:certification_id/promotion-plans")
  @HttpCode(201)
  async planPromotion(
    @Req() request: SandboxRequest,
    @Param("certification_id") certificationId: string,
    @Body() body: unknown,
  ) {
    this.assertMutationSecurity(request);
    const parsed = SandboxPromotionPlanRequestSchema.safeParse(body);
    if (!parsed.success) throw new GovernanceError(
      "INVALID_SANDBOX_PROMOTION_PLAN",
      "Invalid sandbox promotion plan request.",
      400,
    );
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.certifications.planPromotion(
      request.portalUser,
      certificationId,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  private async workspace(request: SandboxRequest, raw: unknown): Promise<string> {
    const workspaceId = raw === undefined || raw === null || raw === ""
      ? request.portalWorkspaceId
      : typeof raw === "string" && raw.length <= 96
        ? raw
        : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: SandboxRequest): void {
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

  private requestId(request: SandboxRequest): string {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && value.length <= 191 ? value : "request-unset";
  }
}
